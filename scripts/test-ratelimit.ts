/**
 * 레이트리밋 단위 검증: 분당 6회 허용 → 7회째 차단, IP 분리 확인.
 * 실행: npx tsx scripts/test-ratelimit.ts
 */
import { checkRateLimit } from "../src/lib/ratelimit";

let pass = 0;
let fail = 0;
function assert(cond: boolean, name: string) {
  if (cond) {
    pass++;
    console.log(`  ✔ ${name}`);
  } else {
    fail++;
    console.error(`  ✘ ${name}`);
  }
}

console.log("[레이트리밋]");
const results = Array.from({ length: 8 }, () => checkRateLimit("1.2.3.4"));
assert(results.slice(0, 6).every((r) => r.allowed), "처음 6회는 허용");
assert(!results[6].allowed && !results[7].allowed, "7회째부터 차단");
assert((results[6].retryAfterSec ?? 0) > 0 && (results[6].retryAfterSec ?? 0) <= 60, "Retry-After가 1~60초");

const other = checkRateLimit("5.6.7.8");
assert(other.allowed, "다른 IP는 영향 없음");

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
