import { config } from "dotenv";
config({ path: ".env.local" });

import { cacheLookup, cacheStore } from "../src/lib/semantic-cache";
import { runQuery, closeDriver } from "../src/lib/neo4j";
import { embedQuery } from "../src/lib/embeddings";

/** threshold 무관하게 최상위 캐시 항목의 원시 유사도 측정 */
async function rawTopScore(question: string): Promise<number | null> {
  const vec = await embedQuery(question);
  const rows = await runQuery<{ score: number }>(
    `CALL db.index.vector.queryNodes('cached_query_embedding', 1, $vec)
     YIELD node, score RETURN score`,
    { vec }
  );
  return rows[0]?.score ?? null;
}

async function main() {
  // 테스트 캐시 정리
  await runQuery(`MATCH (q:CachedQuery) WHERE q.text STARTS WITH '__test__' DETACH DELETE q`);

  const q1 = "__test__ 온라인에서 산 물건 환불 며칠 안에 가능해?";
  const q2 = "__test__ 인터넷 쇼핑 상품 청약철회는 몇 일 이내에 해야 하나요?"; // 의미 동일

  // 1) 미스 → 저장
  const miss = await cacheLookup(q1);
  console.log(`1차 조회: ${miss.hit ? "히트" : "미스"} (예상: 미스)`);
  await cacheStore(q1, miss.queryVec, [{ law: "전자상거래법", article: "제17조" }]);

  // 2) 동일 질문 → 히트
  const exact = await cacheLookup(q1);
  console.log(`동일 질문 조회: ${exact.hit ? "히트" : "미스"} (유사도 ${exact.similarity?.toFixed(4)})`);

  // 3) 의미 유사 질문 → 원시 유사도 측정 (threshold 튜닝 근거)
  const rawSimilar = await rawTopScore(q2);
  console.log(`유사 질문 원시 유사도: ${rawSimilar?.toFixed(4)} (패러프레이즈지만 표현 차이 큼)`);

  const q3 = "__test__ 온라인 구매 물품 단순변심 환불 가능 기간이 며칠이야?";
  const rawSimilar2 = await rawTopScore(q3);
  console.log(`유사 질문2 원시 유사도: ${rawSimilar2?.toFixed(4)} (더 가까운 표현)`);

  // 4) 다른 쟁점 질문 → 오히트(false hit) 위험 측정. 패러프레이즈와 마진이 있어야 안전
  const diffs = [
    "__test__ 반품할 때 배송비는 누가 부담해?", // 제18조 (다른 답)
    "__test__ 과장 광고는 어떤 법으로 규제돼?", // 표시광고법 (완전 다른 쟁점)
  ];
  for (const d of diffs) {
    const s = await rawTopScore(d);
    console.log(`다른 쟁점 유사도: ${s?.toFixed(4)}  "${d.replace("__test__ ", "")}"`);
  }

  // 정리
  await runQuery(`MATCH (q:CachedQuery) WHERE q.text STARTS WITH '__test__' DETACH DELETE q`);
  await closeDriver();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
