/**
 * 개인정보(PII) 마스킹.
 *
 * 대화 로그(Supabase)에 사용자가 실수로 입력한 카드번호·주민번호·전화번호·이메일이
 * 평문 저장되지 않도록 저장 전에 마스킹한다. 저장소 유출 시 피해를 줄이는 최소 방어.
 */

// 순서 중요: 더 구체적인 패턴(주민번호·전화번호)을 카드번호보다 먼저 검사해 정확히 라벨링
const PATTERNS: { name: string; re: RegExp; mask: string }[] = [
  // 이메일
  { name: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, mask: "[이메일]" },
  // 주민등록번호: 6자리-7자리
  { name: "rrn", re: /\b\d{6}[ -]\d{7}\b/g, mask: "[주민번호]" },
  // 전화번호: 010-1234-5678 등
  { name: "phone", re: /\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/g, mask: "[전화번호]" },
  // 카드번호: 13~16자리 (구분자 -, 공백 허용)
  { name: "card", re: /\b(?:\d[ -]?){13,16}\b/g, mask: "[카드번호]" },
  // 계좌번호로 볼 수 있는 10자리 이상 숫자열 (카드/주민 매칭 후 잔여)
  { name: "account", re: /\b\d{10,}\b/g, mask: "[계좌/번호]" },
];

export interface MaskResult {
  masked: string;
  found: string[]; // 어떤 유형이 마스킹됐는지 (로그용, 값 자체는 미포함)
}

export function maskPII(text: string): MaskResult {
  let masked = text;
  const found: string[] = [];
  for (const p of PATTERNS) {
    if (p.re.test(masked)) {
      found.push(p.name);
      masked = masked.replace(p.re, p.mask);
    }
    p.re.lastIndex = 0; // 전역 정규식 상태 초기화
  }
  return { masked, found };
}
