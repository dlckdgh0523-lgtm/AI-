import { runQuery } from "./neo4j";
import { embedQuery } from "./embeddings";

export interface LawSearchResult {
  key: string;
  lawName: string;
  articleNo: string;
  title: string;
  content: string;
  score: number;
  /** 벡터 검색 진입점에서 참조 관계로 확장되어 발견됐는지 */
  via: "vector" | "graph-expansion";
  /** graph-expansion인 경우, 어느 조문에서 확장됐는지 */
  expandedFrom?: string;
}

/**
 * GraphRAG 핵심: 벡터 검색으로 진입점 조문을 찾고,
 * REFERS_TO 관계를 따라 원칙-예외-준용 조문까지 확장 수집한다.
 * 단순 벡터 RAG와 달리, 진입 조문이 참조하는(하거나 참조받는) 조문을
 * 함께 반환하므로 "원칙만 보고 예외를 놓치는" 오답을 줄인다.
 */
export async function searchLawGraph(
  query: string,
  opts: { topK?: number; expandHops?: number } = {}
): Promise<LawSearchResult[]> {
  const topK = opts.topK ?? 4;
  const vec = await embedQuery(query);

  // 1) 벡터 검색으로 진입점 조문
  const entries = await runQuery<{
    key: string;
    lawName: string;
    articleNo: string;
    title: string;
    content: string;
    score: number;
  }>(
    `CALL db.index.vector.queryNodes('article_embedding', $topK, $vec)
     YIELD node, score
     RETURN node.key AS key, node.lawName AS lawName, node.articleNo AS articleNo,
            node.title AS title, node.content AS content, score`,
    { topK, vec }
  );

  const results: LawSearchResult[] = entries.map((e) => ({ ...e, via: "vector" }));
  const seen = new Set(results.map((r) => r.key));

  // 2) 그래프 확장: 진입점이 참조하거나 참조받는 조문 (양방향 1~2홉)
  const expanded = await runQuery<{
    key: string;
    lawName: string;
    articleNo: string;
    title: string;
    content: string;
    fromKey: string;
  }>(
    `UNWIND $keys AS k
     MATCH (src:Article {key: k})-[:REFERS_TO*1..${opts.expandHops ?? 1}]-(dst:Article)
     WHERE NOT dst.key IN $keys
     RETURN DISTINCT dst.key AS key, dst.lawName AS lawName, dst.articleNo AS articleNo,
            dst.title AS title, dst.content AS content, src.key AS fromKey`,
    { keys: [...seen] }
  );

  for (const e of expanded) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    results.push({
      key: e.key,
      lawName: e.lawName,
      articleNo: e.articleNo,
      title: e.title,
      content: e.content,
      score: 0,
      via: "graph-expansion",
      expandedFrom: e.fromKey,
    });
  }

  return results;
}

/** 비교 실험용: 그래프 확장 없는 순수 벡터 RAG */
export async function searchLawVectorOnly(
  query: string,
  topK = 4
): Promise<LawSearchResult[]> {
  const vec = await embedQuery(query);
  const entries = await runQuery<{
    key: string;
    lawName: string;
    articleNo: string;
    title: string;
    content: string;
    score: number;
  }>(
    `CALL db.index.vector.queryNodes('article_embedding', $topK, $vec)
     YIELD node, score
     RETURN node.key AS key, node.lawName AS lawName, node.articleNo AS articleNo,
            node.title AS title, node.content AS content, score`,
    { topK, vec }
  );
  return entries.map((e) => ({ ...e, via: "vector" as const }));
}
