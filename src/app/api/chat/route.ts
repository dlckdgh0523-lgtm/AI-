import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  ORCHESTRATOR_TOOLS,
  ORCHESTRATOR_SYSTEM,
  executeDelegation,
} from "@/lib/agents";
import { logConversation } from "@/lib/supabase";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";
import { extractCitations, checkCitationsExist, RetrievedArticle } from "@/lib/verify";

export const maxDuration = 300;

const client = new Anthropic();
// 오케스트레이터: Opus 4.8 → Sonnet 5 다운시프트.
// 합성(보고서 통합·표 작성)은 Sonnet 5로 충분하고, 입력 $5→$3 / 출력 $25→$15로
// 오케스트레이터 비용 ~40% 절감. 서브에이전트는 기존대로 Haiku 4.5 (agents.ts).
const MODEL = "claude-sonnet-5";
// 위임 루프 + 길이 제한 이어쓰기가 같은 카운터를 쓰므로 여유를 둔다
const MAX_ITERATIONS = 8;

/**
 * 요청 바디 검증 — /api/chat은 공개 엔드포인트라 messages를 신뢰할 수 없다.
 * 도구 입력에만 zod를 쓰고 API 경계를 비워두면, 위조된 assistant 턴이나
 * 초장문 히스토리(입력 토큰 폭탄)가 그대로 모델에 들어간다.
 */
const ChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000), // 클라이언트는 문자열 콘텐츠만 보낸다
      })
    )
    .min(1)
    .max(24), // 멀티턴 상한 — 히스토리 무한 증가로 인한 비용 폭주 방지
  lang: z.enum(["ko", "en"]).optional().default("ko"), // 답변 언어 (외국인 쇼퍼 대응)
});

/**
 * 답변 언어 지시. 검색·조문 데이터는 한국어(네이버·법령)지만 최종 답변은 선택 언어로.
 * 법령 인용은 정확성이 생명이라, 영어로 답하더라도 공식 법령명·조문번호는 유지한다.
 */
function langDirective(lang: "ko" | "en"): string {
  if (lang === "en") {
    return (
      "\n\n## OUTPUT LANGUAGE\n" +
      "Write your FINAL answer to the user in natural English (the user is a non-Korean shopper in Korea). " +
      "Tool results (product names, review snippets, law articles) are in Korean — read them as-is, but explain in English. " +
      "Keep Korean product names in their original form (add a short English gloss if helpful). " +
      "For law citations, keep the official reference intact and add an English translation of the act name, " +
      "e.g. \"전자상거래법(Act on Consumer Protection in Electronic Commerce) Article 17\". Never invent article numbers. " +
      "Keep tables and markdown structure."
    );
  }
  return "";
}

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

/**
 * 답변 맥락에 이어질 후속 유도질문/재검색 액션 3개 생성 (사용자 1인칭 짧은 문장).
 * 상품 추천이 있었으면 "재검색 액션" 위주(더 저렴한 걸로, 무소음으로 등),
 * 아니면 한 걸음 더 들어가는 후속 질문.
 */
async function generateFollowups(
  question: string,
  answer: string,
  hasProducts: boolean,
  lang: "ko" | "en" = "ko"
): Promise<string[]> {
  const guide = hasProducts
    ? "직전 답변이 상품을 추천했습니다. 사용자가 검색을 좁히거나 바꿀 수 있는 '재검색 액션'을 제안하세요. " +
      "예: '조금 더 저렴한 걸로 추천해줘', '무소음 위주로 다시 비교해줘', '더 큰 용량으로 보여줘', " +
      "'환불 규정도 알려줘'. 별점·리뷰 수·구매 수는 네이버 API에 없으므로 그런 필터를 제안하지 마세요. " +
      "가격·기능·용도·소비자권리 축으로만 제안하세요."
    : "직전 답변에 이어 사용자가 실제로 궁금해할 한 걸음 더 들어가는 후속 질문을 제안하세요.";
  const res = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    output_config: { format: { type: "json_schema", schema: FOLLOWUP_SCHEMA } },
    system:
      "당신은 쇼핑·소비자권리 상담의 후속 액션을 제안하는 도우미입니다. " +
      "짧은 문장 3개를 생성하세요. 각 20자 내외, 사용자 1인칭 말투, 서로 다른 축을 다룹니다. " +
      "답변에 이미 다 나온 내용은 피합니다.\n" +
      guide +
      (lang === "en"
        ? "\nWrite the 3 follow-up suggestions in natural English, first-person (e.g. 'Show me cheaper options', 'Can I return it after opening?'), under ~40 chars each."
        : ""),
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
  // 1) 레이트리밋 — 요청당 LLM 비용이 발생하므로 IP당 호출 횟수를 제한 (지갑 고갈 방어)
  const ip = clientIp(req);
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return Response.json(
      { error: "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec ?? 60) } }
    );
  }

  // 2) 입력 검증 — 역할·길이·턴 수를 스키마로 강제
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 JSON 요청입니다." }, { status: 400 });
  }
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "잘못된 요청 형식입니다.", detail: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }
  const history: Anthropic.MessageParam[] = parsed.data.messages;
  const lang = parsed.data.lang;
  if (history[history.length - 1].role !== "user") {
    return Response.json({ error: "마지막 메시지는 사용자 메시지여야 합니다." }, { status: 400 });
  }

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
      // 이번 대화 턴에서 법령 그래프가 실제 반환한 조문 집합 — 최종 합성 답변 검증에 사용
      const retrievedLaw: RetrievedArticle[] = [];
      const traceLog: unknown[] = [];
      const emit = (event: Record<string, unknown>) => {
        if (
          event.type === "agent_start" ||
          event.type === "agent_done" ||
          event.type === "verify_result" ||
          event.type === "final_citation_check" ||
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
            max_tokens: 20000, // 비교표 등 긴 답변 잘림 방지 — Sonnet 5 토크나이저(동일 텍스트 ~30% 더 많은 토큰) 감안해 상향
            thinking: { type: "adaptive", display: "summarized" },
            system: [
              {
                type: "text",
                text: ORCHESTRATOR_SYSTEM, // 캐시 가능한 고정 프리픽스 (언어 지시는 뒤에 분리)
                cache_control: { type: "ephemeral" },
              },
              ...(lang === "en" ? [{ type: "text" as const, text: langDirective(lang) }] : []),
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

          // 길이 제한(max_tokens)으로 답변이 중간에 끊긴 경우 — 잘린 답을 최종본으로
          // 내보내지 않고 이어쓰기를 요청한다. 법령 답변은 조문 인용 + 비교표가 길어
          // adaptive thinking 토큰까지 합치면 상한에 닿는 경우가 있다.
          if (response.stop_reason === "max_tokens") {
            send({ type: "continuation", n: iteration + 1 });
            messages.push({ role: "assistant", content: response.content });
            messages.push({
              role: "user",
              content:
                "(시스템) 직전 응답이 길이 제한으로 중단되었습니다. 이미 출력한 내용은 " +
                "반복하지 말고, 중단된 지점부터 자연스럽게 이어서 답변을 완성하세요.",
            });
            continue;
          }

          if (response.stop_reason !== "tool_use") {
            const usage = {
              input_tokens: totalInputTokens,
              output_tokens: totalOutputTokens,
              cache_read: response.usage.cache_read_input_tokens ?? 0,
            };

            // 최종 합성 답변 인용 검증 (결정론적, LLM 비용 0)
            // 법률 보고서는 서브에이전트 단계에서 검증되지만, 오케스트레이터가 합성 중
            // 조문 번호를 바꾸거나 지어내면 그 부분은 검증 밖이었다. 최종 답변의 모든
            // "○○법 제N조" 인용을 이번 턴에 실제 검색된 조문 집합과 대조한다.
            if (retrievedLaw.length > 0) {
              try {
                const citations = extractCitations(answerText);
                if (citations.length > 0) {
                  const verdicts = checkCitationsExist(citations, retrievedLaw);
                  const failures = verdicts.filter((v) => !v.supported);
                  emit({
                    type: "final_citation_check",
                    passed: failures.length === 0,
                    verdicts,
                  });
                  if (failures.length > 0) {
                    // 이미 스트리밍된 본문은 수정 불가 — 정직하게 각주로 정정 고지
                    const note =
                      `\n\n> ⚠️ **인용 확인**: 아래 조문은 이번 조사에서 검색된 법령에서 확인되지 않았습니다. ` +
                      `해당 부분은 재확인이 필요합니다: ${failures.map((f) => f.citation).join(", ")}`;
                    answerText += note;
                    send({ type: "text_delta", text: note });
                  }
                }
              } catch { /* 최종 검증 실패는 답변 전달을 막지 않는다 */ }
            }

            // 후속 유도질문/재검색 액션 생성 (저비용 Haiku, 실패해도 무시)
            try {
              const hasProducts = traceLog.some(
                (t) =>
                  typeof t === "object" &&
                  t !== null &&
                  (t as { name?: string }).name === "search_products"
              );
              const suggestions = await generateFollowups(userQuestion, answerText, hasProducts, lang);
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
                const { report, usage, retrievedLaw: lawArticles } = await executeDelegation(
                  tu.name,
                  tu.input as Record<string, unknown>,
                  emit,
                  userQuestion
                );
                totalInputTokens += usage.input_tokens;
                totalOutputTokens += usage.output_tokens;
                for (const a of lawArticles) {
                  if (!retrievedLaw.some((r) => r.law === a.law && r.article === a.article)) {
                    retrievedLaw.push(a);
                  }
                }
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
