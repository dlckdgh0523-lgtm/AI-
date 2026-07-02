/**
 * 법령 수집 → Neo4j 지식그래프 적재 파이프라인
 *
 * 실행: npm run ingest
 *
 * 그래프 스키마:
 *   (:Law {name, mst})-[:HAS_ARTICLE]->(:Article {key, articleNo, title, content, embedding})
 *   (:Article)-[:HAS_PARAGRAPH]->(:Paragraph {no, content})
 *   (:Article)-[:REFERS_TO]->(:Article)   // "제N조" 참조 관계
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { searchLaw, fetchLawBody, parseArticles } from "../src/lib/law-api";
import { embedDocuments, EMBEDDING_DIM } from "../src/lib/embeddings";
import { runQuery, closeDriver } from "../src/lib/neo4j";

// 수집 대상: 커머스 소비자보호 관련 핵심 법령
const TARGET_LAWS = [
  "전자상거래 등에서의 소비자보호에 관한 법률",
  "표시ㆍ광고의 공정화에 관한 법률",
  "약관의 규제에 관한 법률",
  "소비자기본법",
];

async function setupIndexes() {
  await runQuery(
    `CREATE CONSTRAINT article_key IF NOT EXISTS
     FOR (a:Article) REQUIRE a.key IS UNIQUE`
  );
  await runQuery(
    `CREATE CONSTRAINT law_name IF NOT EXISTS
     FOR (l:Law) REQUIRE l.name IS UNIQUE`
  );
  await runQuery(
    `CREATE VECTOR INDEX article_embedding IF NOT EXISTS
     FOR (a:Article) ON (a.embedding)
     OPTIONS {indexConfig: {
       \`vector.dimensions\`: ${EMBEDDING_DIM},
       \`vector.similarity_function\`: 'cosine'
     }}`
  );
  await runQuery(
    `CREATE FULLTEXT INDEX article_fulltext IF NOT EXISTS
     FOR (a:Article) ON EACH [a.title, a.content]`
  );
  console.log("✔ 인덱스/제약조건 생성 완료");
}

async function ingestLaw(lawName: string) {
  console.log(`\n=== ${lawName} ===`);
  const results = await searchLaw(lawName);
  // 법령명이 정확히 일치하는 현행 법령 선택 (없으면 첫 결과)
  const match =
    results.find((r: any) => String(r?.법령명한글).trim() === lawName) ?? results[0];
  const mst = String(match?.법령일련번호 ?? match?.MST);
  console.log(`  MST=${mst}, 시행일=${match?.시행일자}`);

  const body = await fetchLawBody(mst);
  const articles = parseArticles(body);
  console.log(`  조문 ${articles.length}개 파싱`);

  // Law 노드
  await runQuery(
    `MERGE (l:Law {name: $name})
     SET l.mst = $mst, l.enforcedAt = $enforcedAt`,
    { name: lawName, mst, enforcedAt: String(match?.시행일자 ?? "") }
  );

  // Article + Paragraph 노드 (배치)
  for (const a of articles) {
    const key = `${lawName}::${a.articleNo}`;
    await runQuery(
      `MATCH (l:Law {name: $lawName})
       MERGE (art:Article {key: $key})
       SET art.articleNo = $articleNo, art.title = $title,
           art.content = $content, art.lawName = $lawName
       MERGE (l)-[:HAS_ARTICLE]->(art)
       WITH art
       UNWIND $paragraphs AS p
       MERGE (para:Paragraph {key: $key + '::' + p.no})
       SET para.no = p.no, para.content = p.content
       MERGE (art)-[:HAS_PARAGRAPH]->(para)`,
      {
        lawName,
        key,
        articleNo: a.articleNo,
        title: a.title,
        content: a.content,
        paragraphs: a.paragraphs.length
          ? a.paragraphs
          : [{ no: "0", content: a.content }],
      }
    );
  }

  // REFERS_TO 엣지 (같은 법령 내 참조)
  for (const a of articles) {
    if (!a.references.length) continue;
    await runQuery(
      `MATCH (src:Article {key: $srcKey})
       UNWIND $refs AS refNo
       MATCH (dst:Article {key: $lawName + '::' + refNo})
       MERGE (src)-[:REFERS_TO]->(dst)`,
      { srcKey: `${lawName}::${a.articleNo}`, lawName, refs: a.references }
    );
  }
  console.log(`  그래프 적재 완료`);

  // 임베딩 (128개씩 배치)
  const BATCH = 128;
  for (let i = 0; i < articles.length; i += BATCH) {
    const batch = articles.slice(i, i + BATCH);
    const vectors = await embedDocuments(
      batch.map((a) => `[${lawName} ${a.articleNo}] ${a.title}\n${a.content}`)
    );
    for (let j = 0; j < batch.length; j++) {
      await runQuery(
        `MATCH (a:Article {key: $key})
         CALL db.create.setNodeVectorProperty(a, 'embedding', $vec)`,
        { key: `${lawName}::${batch[j].articleNo}`, vec: vectors[j] }
      );
    }
    console.log(`  임베딩 ${Math.min(i + BATCH, articles.length)}/${articles.length}`);
  }
}

async function main() {
  await setupIndexes();
  for (const law of TARGET_LAWS) {
    await ingestLaw(law);
  }
  const [stats] = await runQuery<{ laws: unknown; articles: unknown; refs: unknown }>(
    `MATCH (l:Law) WITH count(l) AS laws
     MATCH (a:Article) WITH laws, count(a) AS articles
     OPTIONAL MATCH ()-[r:REFERS_TO]->()
     RETURN laws, articles, count(r) AS refs`
  );
  console.log(`\n✔ 전체 완료 — 법령 ${stats.laws}개, 조문 ${stats.articles}개, 참조 엣지 ${stats.refs}개`);
  await closeDriver();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
