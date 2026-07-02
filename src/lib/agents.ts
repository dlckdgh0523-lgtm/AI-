import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, executeTool } from "./tools";
import { verifyLawReport, RetrievedArticle } from "./verify";
import { SECURITY_RULES, wrapToolData } from "./security";

const client = new Anthropic();
const MODEL = "claude-opus-4-8";
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
- 후보가 좁혀지면 search_reviews로 실사용 후기를 확인합니다.
- 도구 결과에 없는 상품 정보를 절대 지어내지 않습니다.
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
- 조문에 없는 내용을 절대 지어내지 않습니다.
- **search_law는 1~2회 호출로 충분합니다** — 한 번의 검색이 참조 확장으로 관련 조문을 묶어서 반환하므로, 쟁점을 포괄하는 질문 하나로 검색하세요.

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
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" }, // 서브 에이전트는 조사 범위를 좁게 유지 (비용 제어)
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

/** 오케스트레이터의 위임 도구 실행 — 서브 에이전트 루프를 돌리고 보고서 반환 */
export async function executeDelegation(
  toolName: string,
  input: Record<string, unknown>,
  emit: TraceEmitter
): Promise<{ report: string; usage: SubAgentResult["usage"] }> {
  const agentKey = toolName === "delegate_shopping" ? "shopping" : "law";
  const task = String(input.task ?? "");
  const spec = SUB_AGENTS[agentKey];

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

  emit({
    type: "agent_done",
    agent: agentKey,
    label: spec.label,
    iterations: result.iterations,
    usage: result.usage,
  });
  return { report, usage: result.usage };
}
