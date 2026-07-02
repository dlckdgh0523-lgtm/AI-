import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = "claude-opus-4-8";

/** 검증에 쓰이는, 이번 조사에서 실제 검색된 조문 */
export interface RetrievedArticle {
  law: string;
  article: string;
  content: string;
}

export interface CitationVerdict {
  citation: string;
  supported: boolean;
  reason: string;
}

export interface VerificationResult {
  passed: boolean;
  verdicts: CitationVerdict[];
  /** 검증 실패 인용이 있어 수정된 경우의 보고서 (없으면 원본 사용) */
  revisedReport?: string;
}

/** 법령명 약칭 → 정식 명칭 매핑 (인용 표기 정규화용) */
const LAW_ALIASES: Record<string, string> = {
  전자상거래법: "전자상거래 등에서의 소비자보호에 관한 법률",
  표시광고법: "표시ㆍ광고의 공정화에 관한 법률",
  "표시·광고법": "표시ㆍ광고의 공정화에 관한 법률",
  약관규제법: "약관의 규제에 관한 법률",
  약관법: "약관의 규제에 관한 법률",
  소비자기본법: "소비자기본법",
};

/** 보고서에서 "…법 제N조" 형태 인용 추출 */
export function extractCitations(report: string): { law?: string; article: string }[] {
  const found: { law?: string; article: string }[] = [];
  const seen = new Set<string>();
  const re = /([가-힣ㆍ·]+법)?\s*제(\d+)조(의\d+)?/g;
  // "동법", "같은 법", "이 법" 등은 특정 법령명이 아니므로 법령 미지정으로 취급
  const NON_SPECIFIC = new Set(["동법", "같은법", "이법", "위법", "해당법"]);
  let m: RegExpExecArray | null;
  while ((m = re.exec(report))) {
    const lawRaw = m[1];
    const article = `제${m[2]}조${m[3] ?? ""}`;
    const law =
      lawRaw && !NON_SPECIFIC.has(lawRaw)
        ? (LAW_ALIASES[lawRaw] ?? lawRaw)
        : undefined;
    const key = `${law ?? "?"}::${article}`;
    if (!seen.has(key)) {
      seen.add(key);
      found.push({ law, article });
    }
  }
  return found;
}

/**
 * 1단계 (결정론적): 인용된 조문이 이번 조사에서 실제 검색된 조문 집합에 존재하는지 그래프 대조.
 * 법령명이 생략된 인용은 조문번호만으로 대조한다.
 */
export function checkCitationsExist(
  citations: { law?: string; article: string }[],
  retrieved: RetrievedArticle[]
): CitationVerdict[] {
  return citations.map((c) => {
    const exists = retrieved.some(
      (r) => r.article === c.article && (!c.law || r.law === c.law)
    );
    return {
      citation: `${c.law ?? ""} ${c.article}`.trim(),
      supported: exists,
      reason: exists ? "검색된 조문 집합에 존재" : "이번 조사에서 검색되지 않은 조문을 인용함",
    };
  });
}

const VERDICT_SCHEMA = {
  type: "object" as const,
  properties: {
    verdicts: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          citation: { type: "string" as const },
          supported: { type: "boolean" as const },
          reason: { type: "string" as const },
        },
        required: ["citation", "supported", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
};

/**
 * 2단계 (LLM 크리틱): 인용이 조문 내용으로 실제 뒷받침되는지 적대적으로 반박 시도.
 */
async function criticReview(
  report: string,
  retrieved: RetrievedArticle[]
): Promise<CitationVerdict[]> {
  // 긴 조문(예: 전자상거래법 제18조)이 잘리면 크리틱이 "확인 불가→실패"로
  // 오판하므로 충분한 길이를 준다
  const corpus = retrieved
    .map((r) => `[${r.law} ${r.article}]\n${r.content.slice(0, 6000)}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: VERDICT_SCHEMA },
    },
    system:
      "당신은 법령 인용 검증관입니다. 보고서의 각 조문 인용에 대해, 아래 제공된 실제 조문 원문이 " +
      "보고서의 주장을 뒷받침하는지 적대적으로 검토하세요. 반박할 수 있으면 supported=false로 판정합니다. " +
      "조문 원문에 없는 내용을 조문의 것처럼 서술한 경우도 supported=false입니다. " +
      "인용별로 하나의 verdict를 내되, 확신이 없으면 supported=false로 보수적으로 판정하세요.",
    messages: [
      {
        role: "user",
        content: `## 검증 대상 보고서\n${report}\n\n## 실제 검색된 조문 원문\n${corpus}`,
      },
    ],
  });

  const text = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  )?.text;
  if (!text) return [];
  const parsed = JSON.parse(text) as { verdicts: CitationVerdict[] };
  return parsed.verdicts;
}

/** 검증 실패 시 1회 수정 요청 */
async function reviseReport(
  report: string,
  failures: CitationVerdict[],
  retrieved: RetrievedArticle[]
): Promise<string> {
  const corpus = retrieved
    .map((r) => `[${r.law} ${r.article}]\n${r.content.slice(0, 6000)}`)
    .join("\n\n");
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    output_config: { effort: "medium" },
    system:
      "당신은 법령 보고서 교정자입니다. 검증에 실패한 인용을 아래 실제 조문 원문에 맞게 수정하거나, " +
      "뒷받침할 조문이 없으면 해당 주장을 제거하세요. 보고서의 형식과 검증을 통과한 내용은 유지합니다.",
    messages: [
      {
        role: "user",
        content:
          `## 원본 보고서\n${report}\n\n## 검증 실패 인용\n` +
          failures.map((f) => `- ${f.citation}: ${f.reason}`).join("\n") +
          `\n\n## 실제 검색된 조문 원문\n${corpus}\n\n수정된 보고서 전문을 출력하세요.`,
      },
    ],
  });
  return (
    response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ??
    report
  );
}

/**
 * 법률 보고서 적대적 검증 파이프라인:
 *   1) 결정론적 대조 — 인용 조문이 검색 집합에 실존하는가 (그래프 근거)
 *   2) LLM 크리틱 — 조문 원문이 주장을 실제로 뒷받침하는가 (반박 시도)
 *   3) 실패 시 1회 수정
 * 검증 자체가 실패(예외)하면 원본 보고서를 그대로 쓴다 — 검증은 부가 안전장치이지 단일 장애점이 아니다.
 */
export async function verifyLawReport(
  report: string,
  retrieved: RetrievedArticle[]
): Promise<VerificationResult> {
  const citations = extractCitations(report);
  if (citations.length === 0 || retrieved.length === 0) {
    return { passed: true, verdicts: [] };
  }

  // 1단계: 결정론적 존재 대조
  const existence = checkCitationsExist(citations, retrieved);

  // 2단계: LLM 크리틱 (존재하는 인용의 내용 검증)
  const critic = await criticReview(report, retrieved);

  // 병합: 같은 인용은 더 나쁜 판정 우선
  const merged = new Map<string, CitationVerdict>();
  for (const v of [...existence, ...critic]) {
    const prev = merged.get(v.citation);
    if (!prev || (prev.supported && !v.supported)) merged.set(v.citation, v);
  }
  const verdicts = [...merged.values()];
  const failures = verdicts.filter((v) => !v.supported);

  if (failures.length === 0) {
    return { passed: true, verdicts };
  }

  // 3단계: 1회 수정
  const revisedReport = await reviseReport(report, failures, retrieved);
  return { passed: false, verdicts, revisedReport };
}
