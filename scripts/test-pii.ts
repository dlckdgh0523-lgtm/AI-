/** PII 마스킹 단위 테스트 (외부 API 불필요) */
import { maskPII } from "../src/lib/pii";

const cases: { input: string; mustNotContain: string; label: string }[] = [
  { input: "카드번호 1234-5678-9012-3456으로 결제했어", mustNotContain: "3456", label: "카드번호(하이픈)" },
  { input: "카드 1234567890123456 환불해줘", mustNotContain: "1234567890123456", label: "카드번호(연속)" },
  { input: "주민번호 900101-1234567 인증", mustNotContain: "1234567", label: "주민번호" },
  { input: "연락처 010-1234-5678 입니다", mustNotContain: "5678", label: "전화번호" },
  { input: "이메일 hong@example.com 로 보내줘", mustNotContain: "hong@example.com", label: "이메일" },
  { input: "그냥 노트북 추천해줘", mustNotContain: "___없음___", label: "PII 없는 정상 입력" },
];

let pass = 0;
for (const c of cases) {
  const { masked, found } = maskPII(c.input);
  const leaked = c.mustNotContain !== "___없음___" && masked.includes(c.mustNotContain);
  const ok = !leaked;
  if (ok) pass++;
  console.log(`${ok ? "🟢" : "🔴"} ${c.label}: "${masked}" (감지: ${found.join(",") || "없음"})`);
}
console.log(`\n${pass}/${cases.length} 통과`);
if (pass !== cases.length) process.exit(1);
