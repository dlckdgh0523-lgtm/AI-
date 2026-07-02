import Anthropic from "@anthropic-ai/sdk";
import {
  ORCHESTRATOR_TOOLS,
  ORCHESTRATOR_SYSTEM,
  executeDelegation,
} from "@/lib/agents";
import { logConversation } from "@/lib/supabase";

export const maxDuration = 300;

const client = new Anthropic();
const MODEL = "claude-opus-4-8";
const MAX_ITERATIONS = 6;

const FOLLOWUP_SCHEMA = {
  type: "object" as const,
  properties: {
    questions: {
      type: "array" as const,
      items: { type: "string" as const },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

/** 답변 맥락에 이어질 후속 유도질문 3개 생성 (사용자 관점의 짧은 질문) */
async function generateFollowups(question: string, answer: string): Promise<string[]> {
  const res = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    output_config: { format: { type: "json_schema", schema: FOLLOWUP_SCHEMA } },
    system:
      "당신은 쇼핑·소비자권리 상담의 후속 질문을 제안하는 도우미입니다. " +
      "직전 답변에 이어 사용자가 실제로 궁금해할 만한 짧은 후속 질문 3개를 생성하세요. " +
      "각 질문은 20자 내외, 사용자 1인칭 말투(예: '반품 배송비는 얼마야?'), 서로 다른 측면을 다룹니다. " +
      "답변에 이미 다 나온 내용은 피하고, 한 걸음 더 들어가는 질문으로 만드세요.",
    messages: [
      { role: "user", content: `[사용자 질문]\n${question}\n\n[답변 요약]\n${answer.slice(0, 1500)}` },
    ],
  });
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return [];
  const parsed = JSON.parse(text) as { questions: string[] };
  return parsed.questions.slice(0, 3);
}

/**
 * 오케스트레이터 에이전트 루프 + SSE 스트리밍.
 *
 * 구조: 오케스트레이터(Claude)가 질문을 분해해 전문 에이전트에 위임하고
 *       (delegate_shopping / delegate_law — 같은 턴 복수 호출 시 병렬 실행),
 *       보고서를 합성해 최종 답변을 스트리밍한다.
 *
 * 클라이언트 이벤트:
 *   {type:"text_delta", text}                       — 오케스트레이터 최종 응답 조각
 *   {type:"thinking_delta", text}                   — 오케스트레이터 판단 과정
 *   {type:"agent_start", agent, label, task}        — 서브 에이전트 시작
 *   {type:"tool_use"/"tool_result", agent, ...}     — 서브 에이전트 내부 도구 호출
 *   {type:"agent_done", agent, label, usage}        — 서브 에이전트 완료
 *   {type:"iteration", n}                           — 오케스트레이터 루프 회차
 *   {type:"done", usage} / {type:"error", message}
 */
export async function POST(req: Request) {
  const { messages: history } = (await req.json()) as {
    messages: Anthropic.MessageParam[];
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const messages: Anthropic.MessageParam[] = [...history];
      // 사용자 원 질문 — 법률 위임 의미 캐시의 안정적 키로 사용
      const lastUserMsg = [...history].reverse().find((m) => m.role === "user");
      const userQuestion =
        typeof lastUserMsg?.content === "string"
          ? lastUserMsg.content
          : JSON.stringify(lastUserMsg?.content ?? "");
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let answerText = "";
      const traceLog: unknown[] = [];
      const emit = (event: Record<string, unknown>) => {
        if (
          event.type === "agent_start" ||
          event.type === "agent_done" ||
          event.type === "verify_result" ||
          event.type === "cache_hit"
        ) {
          traceLog.push(event);
        } else if (event.type === "tool_use") {
          traceLog.push({ kind: "tool_use", agent: event.agent, name: event.name, input: event.input });
        } else if (event.type === "tool_result") {
          traceLog.push({ kind: "tool_result", agent: event.agent, name: event.name, summary: event.summary });
        }
        send(event);
      };

      try {
        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
          send({ type: "iteration", n: iteration + 1 });

          const msgStream = client.messages.stream({
            model: MODEL,
            max_tokens: 8192,
            thinking: { type: "adaptive", display: "summarized" },
            system: [
              {
                type: "text",
                text: ORCHESTRATOR_SYSTEM,
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: ORCHESTRATOR_TOOLS,
            messages,
          });

          msgStream.on("streamEvent", (event) => {
            if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                answerText += event.delta.text;
                send({ type: "text_delta", text: event.delta.text });
              } else if (event.delta.type === "thinking_delta") {
                send({ type: "thinking_delta", text: event.delta.thinking });
              }
            }
          });

          const response = await msgStream.finalMessage();
          totalInputTokens += response.usage.input_tokens;
          totalOutputTokens += response.usage.output_tokens;

          if (response.stop_reason !== "tool_use") {
            const usage = {
              input_tokens: totalInputTokens,
              output_tokens: totalOutputTokens,
              cache_read: response.usage.cache_read_input_tokens ?? 0,
            };
            // 후속 유도질문 생성 (저비용 Haiku, 실패해도 무시)
            try {
              const suggestions = await generateFollowups(userQuestion, answerText);
              if (suggestions.length) send({ type: "suggestions", items: suggestions });
            } catch { /* 유도질문 생성 실패는 무시 */ }

            send({ type: "done", usage });
            void logConversation({ question: userQuestion, answer: answerText, traces: traceLog, usage });
            break;
          }

          messages.push({ role: "assistant", content: response.content });

          const toolUses = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );

          // 복수 위임은 병렬 실행 — 서브 에이전트가 동시에 조사한다
          const toolResults = await Promise.all(
            toolUses.map(async (tu): Promise<Anthropic.ToolResultBlockParam> => {
              try {
                const { report, usage } = await executeDelegation(
                  tu.name,
                  tu.input as Record<string, unknown>,
                  emit,
                  userQuestion
                );
                totalInputTokens += usage.input_tokens;
                totalOutputTokens += usage.output_tokens;
                return {
                  type: "tool_result",
                  tool_use_id: tu.id,
                  content: report,
                };
              } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                emit({
                  type: "agent_done",
                  agent: tu.name === "delegate_shopping" ? "shopping" : "law",
                  label: "오류",
                  error: message,
                });
                return {
                  type: "tool_result",
                  tool_use_id: tu.id,
                  content: `에이전트 실행 오류: ${message}`,
                  is_error: true,
                };
              }
            })
          );

          messages.push({ role: "user", content: toolResults });
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
