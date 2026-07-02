/**
 * 토큰 비용 벤치마크: 최적화 전/후를 수치화한다.
 *
 * 실행: npm run bench
 *
 * 측정 항목:
 *  A. 서브에이전트 모델 다운시프트 (Opus→Haiku) 비용 절감
 *  B. 의미 캐시 히트 시 법령 검색 비용(임베딩+그래프) 절감
 *
 * 주의: 실제 에이전트를 돌리지 않고, 대표 사용량 수치와 공개 단가로 비용을 산출한다.
 *       사용량 수치는 이전 실측 로그(Supabase)에서 관측된 범위를 사용.
 */

export {}; // 모듈 스코프로 격리 (전역 main 충돌 방지)

// 공개 단가 (USD per 1M tokens)
const PRICE = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

function cost(model: keyof typeof PRICE, inTok: number, outTok: number): number {
  const p = PRICE[model];
  return (inTok * p.in + outTok * p.out) / 1_000_000;
}

// 실측 로그에서 관측된 서브에이전트 1회 조사 평균 사용량 (도구 결과 포함 입력이 큼)
const SUBAGENT_USAGE = { in: 30000, out: 3000 };
// 복합 질문 1건당 서브에이전트 평균 호출 수 (쇼핑 + 법률)
const SUBAGENTS_PER_QUERY = 2;

function benchModelDownshift() {
  const opus = cost("claude-opus-4-8", SUBAGENT_USAGE.in, SUBAGENT_USAGE.out) * SUBAGENTS_PER_QUERY;
  const haiku = cost("claude-haiku-4-5", SUBAGENT_USAGE.in, SUBAGENT_USAGE.out) * SUBAGENTS_PER_QUERY;
  return { opus, haiku, savedPct: Math.round((1 - haiku / opus) * 100) };
}

// 법령 검색 1회 비용: 임베딩(Voyage, 무료 티어라 $0로 계산) + 그래프 순회는 Neo4j(무료).
// 실질 비용은 캐시 미스 시 서브에이전트가 큰 조문 텍스트를 컨텍스트로 다시 읽는 데서 발생.
// 캐시 히트는 동일 결과를 반환하므로 "중복 법령 검색을 유발하는 추가 조사 루프"를 절감한다.
// 여기서는 반복 질문 비율에 따른 서브에이전트 재실행 절감을 보수적으로 추정.
function benchSemanticCache(repeatRatio: number) {
  const perLawQuery = cost("claude-haiku-4-5", 30000, 2000); // 법률 서브에이전트 1회
  const queries = 100;
  const withoutCache = perLawQuery * queries;
  // 캐시 히트분은 그래프 검색을 건너뛰어 조사 루프 1회가 줄어든다고 가정 (보수적: 30% 절감)
  const withCache = perLawQuery * queries * (1 - repeatRatio * 0.3);
  return { withoutCache, withCache, repeatRatio, savedPct: Math.round((1 - withCache / withoutCache) * 100) };
}

function main() {
  console.log("=== A. 서브에이전트 모델 다운시프트 (복합 질문 1건 기준) ===");
  const a = benchModelDownshift();
  console.log(`  Opus 서브에이전트:  $${a.opus.toFixed(4)}`);
  console.log(`  Haiku 서브에이전트: $${a.haiku.toFixed(4)}`);
  console.log(`  → 절감: ${a.savedPct}%\n`);

  console.log("=== B. 의미 캐시 (법령 질문 100건, 반복률별) ===");
  for (const r of [0.3, 0.5, 0.7]) {
    const b = benchSemanticCache(r);
    console.log(`  반복률 ${Math.round(r * 100)}%: $${b.withoutCache.toFixed(3)} → $${b.withCache.toFixed(3)} (절감 ${b.savedPct}%)`);
  }

  console.log("\n주의: 임베딩(Voyage 무료 티어)·그래프 순회(Neo4j 무료)는 $0으로 계산.");
  console.log("실질 비용 절감은 (A) 저비용 모델 전환 + (B) 반복 질문의 조사 루프 축소에서 발생.");
}

main();
