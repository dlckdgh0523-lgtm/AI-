import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, executeTool } from "./tools";
import { verifyLawReport, RetrievedArticle } from "./verify";
import { SECURITY_RULES, wrapToolData } from "./security";
import { cacheLookup, cacheStore } from "./semantic-cache";

const client = new Anthropic();
// 오케스트레이터(판단·합성, route.ts)는 고성능 Opus, 서브 에이전트(조사)는 저비용 Haiku로 분리.
// 조사 작업은 도구 호출·요약 위주라 Haiku로 충분하며, 이것이 토큰 비용의 주요 절감 레버다.
const SUB_AGENT_MODEL = "claude-haiku-4-5";
const SUB_AGENT_MAX_ITERATIONS = 3;

/** 트레이스 이벤트 방출 콜백 (SSE로 전달됨) */
export type TraceEmitter = (event: Record<string, unknown>) => void;

export interface SubAgentSpec {
  key: string;
  label: string;
  system: string;
  toolNames: string[];
}

export const SUB_AGENTS: Record<string, SubAgentSpec> = {
  shopping: {
    key: "shopping",
    label: "쇼핑 전문 에이전트",
    toolNames: ["search_products", "search_reviews"],
    system: `당신은 상품 조사 전문 에이전트입니다. 오케스트레이터로부터 조사 과제를 받아 수행하고 보고서를 반환합니다.

## 수행 방식
- 사용자의 상황(계절, 용도, 예산, 공간)을 구체적인 검색 키워드로 변환해 search_products를 호출합니다.
- 예산 언급이 있으면 min_price/max_price로 가격 범위를 지정하고, "더 저렴한 걸로" 같은 요청이면 max_price를 낮추거나 sort=asc로 재검색합니다.
- 후보가 좁혀지면 search_reviews로 실사용 후기를 확인합니다.
- **⚠️ 별점·리뷰 개수·구매 횟수는 네이버 검색 API가 제공하지 않습니다. 이 수치를 절대 지어내지 마세요.** 제품 평판은 search_reviews(블로그 후기)의 정성적 내용으로만 근거를 제시하고, "리뷰 N건" 같은 구체 수치는 쓰지 않습니다.
- 도구 결과에 없는 상품 정보(스펙·가격)를 절대 지어내지 않습니다.
- **도구 호출은 총 3회 이내로 마칩니다**: 상품 검색 1~2회 + 대표 후보 후기 검색 1회면 충분합니다. 완벽한 커버리지보다 빠르고 근거 있는 보고가 우선입니다.

## 보고서 형식 (마크다운)
- 후보 상품: 상품명, 가격, 판매처, 링크
- 2개 이상이면 비교표 (가격/핵심 특징/후기 요약)
- 후기에서 확인된 장단점과 주의사항
- 근거가 부족한 부분은 "확인 불가"로 명시
${SECURITY_RULES}`,
  },
  law: {
    key: "law",
    label: "법률 전문 에이전트",
    toolNames: ["search_law"],
    system: `당신은 커머스 소비자보호 법령 전문 에이전트입니다. 오케스트레이터로부터 법적 쟁점을 받아 조사하고 보고서를 반환합니다.

## 수행 방식
- search_law(법령 지식그래프)를 호출해 관련 조문을 수집합니다. 그래프가 참조 관계로 확장한 조문(via: graph-expansion)까지 반드시 검토합니다.
- 원칙 조문만 보고 결론 내리지 않습니다. 예외 조항, 예외의 예외(단서)까지 확인합니다.
- **⚠️ 인용 규칙 (매우 중요)**: 반드시 **search_law가 반환한 조문만** 법령명·조문번호로 인용하세요. 반환되지 않은 조문번호(예: 검색 결과에 없는 제19조)나 우리가 조회하지 않은 다른 법(민법·형법 등)의 조문번호를 당신의 지식으로 인용하면 안 됩니다. 반환된 조문으로 답할 수 없는 부분은 "관련 조문이 검색되지 않아 확인이 필요합니다"라고 밝히고, 특정 조문번호를 지어내지 마세요. (인용 검증기가 반환되지 않은 인용을 탈락시킵니다.)
- 조문 번호 없이 일반 원칙을 설명하는 것은 괜찮지만, "○○법 제N조"처럼 번호를 붙이는 순간 그 조문은 반드시 검색 결과에 있어야 합니다.
- **search_law는 1~2회 호출로 충분합니다** — 한 번의 검색이 참조 확장으로 관련 조문을 묶어서 반환하므로, 쟁점을 포괄하는 질문 하나로 검색하세요.
- **search_law의 question은 키워드 나열이 아니라 간결한 자연어 질문 한 문장으로 작성하세요** (예: "온라인 구매 상품 단순변심 청약철회 기간과 반품 배송비 부담은?"). 표현을 안정적으로 유지하면 동일 쟁점 질문의 의미 캐시 재사용률이 높아집니다.

## 보고서 형식 (마크다운)
- 결론 (가능/불가능/조건부)
- 근거: 법령명 + 조문번호 + 해당 내용 (예: 전자상거래법 제17조 제1항)
- 예외·제한 사항과 그 근거 조문
- 마지막 줄: "본 내용은 일반 정보 안내이며 법률 자문이 아닙니다."
${SECURITY_RULES}`,
  },
};

/** 오케스트레이터가 쓰는 위임 도구 정의 */
export const ORCHESTRATOR_TOOLS: Anthropic.Tool[] = [
  {
    name: "delegate_shopping",
    description:
      "쇼핑 전문 에이전트에게 상품 탐색·추천·비교·후기 조사를 위임한다. " +
      "task는 전문가가 맥락 없이도 수행할 수 있게 자족적으로 작성할 것 (예산, 용도, 상황 포함).",
    input_schema: {
      type: "object" as const,
      properties: {
        task: { type: "string", description: "위임할 조사 과제 (자족적 서술)" },
      },
      required: ["task"],
    },
  },
  {
    name: "delegate_law",
    description:
      "법률 전문 에이전트에게 환불·청약철회·교환·광고규제·약관 등 소비자보호 법령 조사를 위임한다. " +
      "task는 법적 쟁점이 명확히 드러나게 자족적으로 작성할 것.",
    input_schema: {
      type: "object" as const,
      properties: {
        task: { type: "string", description: "위임할 법적 쟁점 (자족적 서술)" },
      },
      required: ["task"],
    },
  },
];

export const ORCHESTRATOR_SYSTEM = `당신은 "쇼핑 컨시어지"의 오케스트레이터입니다. 사용자 질문을 분석해 전문 에이전트에게 위임하고, 보고를 합성해 최종 답변을 만듭니다.

## 위임 규칙
- 상품 추천·탐색·비교·후기 → delegate_shopping
- 환불·청약철회·교환·광고 규제·약관·소비자 분쟁 → delegate_law
- 질문에 두 영역이 모두 있으면 **두 도구를 같은 턴에 동시에 호출**합니다 (병렬 실행됨).
- 위임 task는 전문가가 이 대화를 못 봐도 수행할 수 있게 자족적으로 작성합니다.
- 단순 인사, 이전 답변에 대한 간단한 재질문 등 위임이 불필요하면 직접 답합니다.

## 합성 규칙
- 전문가 보고의 사실(상품 정보, 조문 번호)을 왜곡하거나 추가하지 않습니다.
- 법률 보고의 조문 인용(법령명+조문번호)은 최종 답변에 유지합니다.
- 두 보고를 합칠 때는 사용자 질문의 흐름에 맞게 재구성하되, 간결하고 읽기 쉬운 한국어로 씁니다.
- **복잡한 정보는 반드시 마크다운 표로 정리합니다**: 상품 2개 이상 비교(가격/핵심 특징/추천 대상 열), 여러 조문의 요건·예외 정리, 절차 단계 등. 표는 사용자가 한눈에 비교하기 좋게 만듭니다.
- 답변 구조: 결론/핵심 요약을 먼저, 그다음 표와 근거, 마지막에 주의사항. 소제목(##)으로 구분합니다.
- 법령 안내가 포함되면 "일반 정보 안내이며 법률 자문이 아닙니다"를 답변 끝에 짧게 남깁니다.
${SECURITY_RULES}`;

export interface SubAgentResult {
  report: string;
  usage: { input_tokens: number; output_tokens: number };
  iterations: number;
  /** 이번 조사에서 search_law가 실제 반환한 조문 (인용 검증용) */
  retrievedLaw: RetrievedArticle[];
}

/**
 * 서브 에이전트 실행: 역할별 시스템 프롬프트 + 도구 부분집합으로
 * 독립 tool use 루프를 돌고 최종 보고서를 반환한다.
 * 내부 도구 호출은 emit으로 트레이스에 노출된다.
 */
export async function runSubAgent(
  agentKey: keyof typeof SUB_AGENTS,
  task: string,
  emit: TraceEmitter
): Promise<SubAgentResult> {
  const spec = SUB_AGENTS[agentKey];
  const tools = TOOLS.filter((t) => spec.toolNames.includes(t.name));
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];

  let inputTokens = 0;
  let outputTokens = 0;
  const retrievedLaw: RetrievedArticle[] = [];

  for (let i = 0; i < SUB_AGENT_MAX_ITERATIONS; i++) {
    // Haiku 4.5는 effort/adaptive thinking을 지원하지 않으므로 plain tool use로 실행
    const response = await client.messages.create({
      model: SUB_AGENT_MODEL,
      max_tokens: 4096,
      system: [
        { type: "text", text: spec.system, cache_control: { type: "ephemeral" } },
      ],
      tools,
      messages,
    });
    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;

    if (response.stop_reason !== "tool_use") {
      const report = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return {
        report,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        iterations: i + 1,
        retrievedLaw,
      };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const tu of toolUses) {
      emit({ type: "tool_use", agent: agentKey, id: tu.id, name: tu.name, input: tu.input });
      try {
        const exec = await executeTool(tu.name, tu.input as Record<string, unknown>);
        if (tu.name === "search_law" && Array.isArray(exec.result)) {
          for (const a of exec.result as { law: string; article: string; content: string }[]) {
            if (!retrievedLaw.some((r) => r.law === a.law && r.article === a.article)) {
              retrievedLaw.push({ law: a.law, article: a.article, content: a.content });
            }
          }
        }
        emit({
          type: "tool_result",
          agent: agentKey,
          id: tu.id,
          name: tu.name,
          summary: exec.summary,
          result: exec.result,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: wrapToolData(JSON.stringify(exec.result)),
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        emit({ type: "tool_result", agent: agentKey, id: tu.id, name: tu.name, summary: `오류: ${message}`, result: null });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `도구 실행 오류: ${message}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  return {
    report: "(반복 한도 초과로 조사를 완료하지 못했습니다)",
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    iterations: SUB_AGENT_MAX_ITERATIONS,
    retrievedLaw,
  };
}

/**
 * 오케스트레이터의 위임 도구 실행 — 서브 에이전트 루프를 돌리고 보고서 반환.
 *
 * 법률 위임은 **사용자 원 질문**을 키로 의미 캐시한다 (진로나침반 방식).
 * 핵심: LLM이 생성한 가변 질의가 아니라 안정적인 사용자 입력을 임베딩하므로,
 * 의미가 같은 질문(예: "환불 며칠?" ≈ "청약철회 기간?")이 실제로 히트한다.
 * 법령은 요청마다 바뀌지 않으므로 법률 보고서 캐시는 안전하다 (상품 추천은 시세 변동 때문에 캐시 안 함).
 */
export async function executeDelegation(
  toolName: string,
  input: Record<string, unknown>,
  emit: TraceEmitter,
  userQuestion?: string
): Promise<{ report: string; usage: SubAgentResult["usage"] }> {
  const agentKey = toolName === "delegate_shopping" ? "shopping" : "law";
  const task = String(input.task ?? "");
  const spec = SUB_AGENTS[agentKey];

  // 법률 위임: 사용자 원 질문 기반 의미 캐시 조회
  let cachedQueryVec: number[] | undefined;
  if (agentKey === "law" && userQuestion) {
    const cached = await cacheLookup<{ report: string }>(userQuestion);
    cachedQueryVec = cached.queryVec;
    if (cached.hit && cached.result) {
      emit({
        type: "cache_hit",
        agent: "law",
        similarity: cached.similarity,
        cachedQuestion: cached.cachedQuestion,
      });
      emit({
        type: "agent_done",
        agent: agentKey,
        label: `${spec.label} (의미 캐시 히트)`,
        iterations: 0,
        usage: { input_tokens: 0, output_tokens: 0 },
      });
      return { report: cached.result.report, usage: { input_tokens: 0, output_tokens: 0 } };
    }
  }

  emit({ type: "agent_start", agent: agentKey, label: spec.label, task });
  const result = await runSubAgent(agentKey, task, emit);

  let report = result.report;

  // 법률 보고서는 적대적 인용 검증을 거친다 (검증 실패해도 원본으로 폴백 — 단일 장애점 아님)
  if (agentKey === "law" && result.retrievedLaw.length > 0) {
    emit({ type: "verify_start", agent: agentKey });
    try {
      const verification = await verifyLawReport(report, result.retrievedLaw);
      if (!verification.passed && verification.revisedReport) {
        report = verification.revisedReport;
      }
      emit({
        type: "verify_result",
        agent: agentKey,
        passed: verification.passed,
        verdicts: verification.verdicts,
        revised: !verification.passed,
      });
    } catch (e) {
      emit({
        type: "verify_result",
        agent: agentKey,
        passed: true,
        verdicts: [],
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 법률 보고서를 사용자 원 질문 키로 캐시 저장 (조회 때 계산한 임베딩 재사용)
  if (agentKey === "law" && userQuestion && cachedQueryVec) {
    await cacheStore(userQuestion, cachedQueryVec, { report });
  }

  emit({
    type: "agent_done",
    agent: agentKey,
    label: spec.label,
    iterations: result.iterations,
    usage: result.usage,
  });
  return { report, usage: result.usage };
}
