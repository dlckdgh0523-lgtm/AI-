import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, SYSTEM_PROMPT, executeTool } from "@/lib/tools";
import { logConversation } from "@/lib/supabase";

export const maxDuration = 120;

const client = new Anthropic();
const MODEL = "claude-opus-4-8";
const MAX_ITERATIONS = 8;

/**
 * 에이전트 루프 + SSE 스트리밍.
 * 클라이언트로 보내는 이벤트:
 *   {type:"text_delta", text}                     — 응답 텍스트 조각
 *   {type:"thinking_delta", text}                 — 판단 과정 요약 조각
 *   {type:"tool_use", id, name, input}            — 도구 호출 시작
 *   {type:"tool_result", id, name, summary, result} — 도구 실행 결과
 *   {type:"iteration", n}                         — 에이전트 루프 회차
 *   {type:"done", usage}                          — 종료
 *   {type:"error", message}
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
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let answerText = "";
      const traceLog: unknown[] = [];

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
                text: SYSTEM_PROMPT,
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: TOOLS,
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
            send({ type: "done", usage });

            // 대화 로그 적재 (fire-and-forget)
            const lastUser = [...history].reverse().find((m) => m.role === "user");
            const question =
              typeof lastUser?.content === "string"
                ? lastUser.content
                : JSON.stringify(lastUser?.content ?? "");
            void logConversation({ question, answer: answerText, traces: traceLog, usage });
            break;
          }

          // 도구 호출 처리
          messages.push({ role: "assistant", content: response.content });

          const toolUses = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const tu of toolUses) {
            traceLog.push({ kind: "tool_use", name: tu.name, input: tu.input });
            send({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
            try {
              const exec = await executeTool(
                tu.name,
                tu.input as Record<string, unknown>
              );
              traceLog.push({ kind: "tool_result", name: tu.name, summary: exec.summary });
              send({
                type: "tool_result",
                id: tu.id,
                name: tu.name,
                summary: exec.summary,
                result: exec.result,
              });
              toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: JSON.stringify(exec.result),
              });
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e);
              send({ type: "tool_result", id: tu.id, name: tu.name, summary: `오류: ${message}`, result: null });
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
