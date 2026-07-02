/**
 * 의미 캐시 검증 — 사용자 원 질문을 키로 했을 때 실제 히트하는지.
 * (Anthropic API 불필요, 임베딩은 Voyage)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { cacheLookup, cacheStore } from "../src/lib/semantic-cache";
import { runQuery, closeDriver } from "../src/lib/neo4j";

async function main() {
  await runQuery(`MATCH (q:CachedQuery) WHERE q.text STARTS WITH '__test__' DETACH DELETE q`);

  // 사용자가 처음 던진 질문 → 미스 → 법률 보고서 저장
  const first = "__test__ 온라인에서 산 물건 환불 며칠 안에 가능해?";
  const miss = await cacheLookup<{ report: string }>(first);
  console.log(`1) 첫 질문: ${miss.hit ? "히트" : "미스(정상)"}`);
  await cacheStore(first, miss.queryVec, { report: "전자상거래법 제17조: 7일 이내 청약철회 가능..." });

  // 다른 사용자가 의미가 같은 질문을 다른 표현으로 → 히트해야 함
  const paraphrases = [
    "__test__ 인터넷 쇼핑 상품 청약철회는 몇 일 이내에 해야 하나요?",
    "__test__ 온라인 구매 물품 단순변심 환불 가능 기간이 며칠이야?",
  ];
  for (const p of paraphrases) {
    const r = await cacheLookup<{ report: string }>(p);
    console.log(
      `2) 유사 질문 "${p.replace("__test__ ", "")}"\n   → ${r.hit ? `✅ 히트 (유사도 ${r.similarity?.toFixed(3)})` : "❌ 미스"}`
    );
  }

  // 다른 쟁점 질문 → 미스해야 함 (false hit 방지 확인)
  const different = "__test__ 과장 광고는 어떤 법으로 규제돼?";
  const d = await cacheLookup<{ report: string }>(different);
  console.log(
    `3) 다른 쟁점 "${different.replace("__test__ ", "")}"\n   → ${d.hit ? "🔴 false hit(문제!)" : "✅ 정상 미스"}`
  );

  await runQuery(`MATCH (q:CachedQuery) WHERE q.text STARTS WITH '__test__' DETACH DELETE q`);
  await closeDriver();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
