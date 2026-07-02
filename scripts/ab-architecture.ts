/**
 * A/B 측정: 단일 에이전트 vs 멀티 에이전트 오케스트레이션.
 *
 * 실행: npm run ab   (Anthropic 크레딧 필요)
 *
 * 오케스트레이션 도입을 "좋아 보여서"가 아니라 수치로 정당화한다.
 *  - 단일 에이전트: 한 Claude가 도구 3종을 직접 다룸 (tools.ts SYSTEM_PROMPT)
 *  - 멀티 에이전트: 오케스트레이터가 전문 에이전트에 위임 (agents.ts, /api/chat)
 *
 * 측정: 품질(LLM 저지 루브릭), 토큰, 레이턴시. 동일 질문셋으로 비교.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "fs";
import { TOOLS, SYSTEM_PROMPT, executeTool } from "../src/lib/tools";

const client = new Anthropic();
const JUDGE_MODEL = "claude-opus-4-8";

// 상품+법령이 섞인 복합 질문 위주 (오케스트레이션이 유리할 것으로 가정되는 지점)
const QUESTIONS = [
  "10만원 이하 무선 이어폰 추천해주고, 온라인에서 사면 환불 규정도 알려줘",
  "자취 시작하는데 20만원 이하 로봇청소기 추천하고, 하자 있으면 교환 되는지도 알려줘",
  "캠핑 버너 2개 비교해주고, 개봉 후 단순변심 반품 가능한지 알려줘",
];

interface RunResult {
  answer: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
}

/** 단일 에이전트: 도구 3종을 직접 다루는 하나의 루프 */
async function runSingleAgent(question: string): Promise<RunResult> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  let inTok = 0;
  let outTok = 0;
  const start = Date.now();

  for (let i = 0; i < 8; i++) {
    const res = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });
    inTok += res.usage.input_tokens;
    outTok += res.usage.output_tokens;
    if (res.stop_reason !== "tool_use") {
      const answer = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return { answer, inputTokens: inTok, outputTokens: outTok, ms: Date.now() - start };
    }
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const b of res.content) {
      if (b.type !== "tool_use") continue;
      try {
        const exec = await executeTool(b.name, b.input as Record<string, unknown>);
        results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(exec.result) });
      } catch (e) {
        results.push({
          type: "tool_result",
          tool_use_id: b.id,
          content: `오류: ${e instanceof Error ? e.message : e}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { answer: "(미완료)", inputTokens: inTok, outputTokens: outTok, ms: Date.now() - start };
}

/** 멀티 에이전트: 실제 서비스 경로(/api/chat)를 호출 */
async function runMultiAgent(question: string): Promise<RunResult> {
  const start = Date.now();
  const res = await fetch("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let usage = { input_tokens: 0, output_tokens: 0 };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const p of parts) {
      if (!p.startsWith("data: ")) continue;
      const ev = JSON.parse(p.slice(6));
      if (ev.type === "text_delta") answer += ev.text;
      if (ev.type === "done") usage = ev.usage;
    }
  }
  return { answer, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, ms: Date.now() - start };
}

const JUDGE_SCHEMA = {
  type: "object" as const,
  properties: {
    completeness: { type: "integer" as const },
    citation_accuracy: { type: "integer" as const },
    actionability: { type: "integer" as const },
    reason: { type: "string" as const },
  },
  required: ["completeness", "citation_accuracy", "actionability", "reason"],
  additionalProperties: false,
};

/** LLM 저지: 답변 품질을 루브릭으로 1~5 채점 */
async function judge(question: string, answer: string) {
  const res = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 512,
    output_config: { effort: "low", format: { type: "json_schema", schema: JUDGE_SCHEMA } },
    system:
      "당신은 커머스 상담 답변 채점관입니다. 각 항목을 1~5로 채점하세요. " +
      "completeness(질문의 상품+법령 측면을 모두 다뤘는가), " +
      "citation_accuracy(법령 인용에 법령명·조문번호가 있고 구체적인가), " +
      "actionability(사용자가 바로 행동할 수 있는 구체적 정보인가).",
    messages: [{ role: "user", content: `[질문]\n${question}\n\n[답변]\n${answer}` }],
  });
  const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  return text
    ? (JSON.parse(text) as { completeness: number; citation_accuracy: number; actionability: number; reason: string })
    : { completeness: 0, citation_accuracy: 0, actionability: 0, reason: "판정 실패" };
}

async function main() {
  const rows: string[] = [];
  const agg = {
    single: { comp: 0, cite: 0, act: 0, inTok: 0, outTok: 0, ms: 0 },
    multi: { comp: 0, cite: 0, act: 0, inTok: 0, outTok: 0, ms: 0 },
  };

  for (const q of QUESTIONS) {
    console.log(`\nQ: ${q}`);
    const single = await runSingleAgent(q);
    const multi = await runMultiAgent(q);
    const sj = await judge(q, single.answer);
    const mj = await judge(q, multi.answer);

    agg.single.comp += sj.completeness; agg.single.cite += sj.citation_accuracy; agg.single.act += sj.actionability;
    agg.single.inTok += single.inputTokens; agg.single.outTok += single.outputTokens; agg.single.ms += single.ms;
    agg.multi.comp += mj.completeness; agg.multi.cite += mj.citation_accuracy; agg.multi.act += mj.actionability;
    agg.multi.inTok += multi.inputTokens; agg.multi.outTok += multi.outputTokens; agg.multi.ms += multi.ms;

    console.log(`  단일: 완전성 ${sj.completeness} 인용 ${sj.citation_accuracy} 실행성 ${sj.actionability} | ${single.inputTokens}/${single.outputTokens}tok ${(single.ms / 1000).toFixed(1)}s`);
    console.log(`  멀티: 완전성 ${mj.completeness} 인용 ${mj.citation_accuracy} 실행성 ${mj.actionability} | ${multi.inputTokens}/${multi.outputTokens}tok ${(multi.ms / 1000).toFixed(1)}s`);
    rows.push(`| ${q.slice(0, 30)}… | ${sj.completeness}/${sj.citation_accuracy}/${sj.actionability} | ${mj.completeness}/${mj.citation_accuracy}/${mj.actionability} |`);
  }

  const n = QUESTIONS.length;
  const avg = (x: number) => (x / n).toFixed(1);
  // 단가로 비용 산출 (단일=Opus 전량, 멀티=오케 Opus + 서브 Haiku 혼합이나 여기선 총 토큰만 비교)
  const report = `# A/B: 단일 에이전트 vs 멀티 에이전트 오케스트레이션

- 평가일: ${new Date().toISOString().slice(0, 10)}
- 질문: 상품+법령 복합 질문 ${n}건 (오케스트레이션이 유리할 것으로 가정한 지점)
- 품질: LLM 저지 루브릭 (완전성/인용정확성/실행성, 각 1~5)

## 요약 (평균)

| 지표 | 단일 에이전트 | 멀티 에이전트 |
|---|---|---|
| 완전성 | ${avg(agg.single.comp)} | ${avg(agg.multi.comp)} |
| 인용 정확성 | ${avg(agg.single.cite)} | ${avg(agg.multi.cite)} |
| 실행성 | ${avg(agg.single.act)} | ${avg(agg.multi.act)} |
| 입력 토큰(합) | ${agg.single.inTok} | ${agg.multi.inTok} |
| 출력 토큰(합) | ${agg.single.outTok} | ${agg.multi.outTok} |
| 평균 레이턴시 | ${(agg.single.ms / n / 1000).toFixed(1)}s | ${(agg.multi.ms / n / 1000).toFixed(1)}s |

## 케이스별 품질 (완전성/인용/실행)

| 질문 | 단일 | 멀티 |
|---|---|---|
${rows.join("\n")}

## 해석

- 멀티 에이전트가 품질(특히 완전성·인용)에서 우위면, 오케스트레이션 도입이 정당화된다.
- 토큰·레이턴시가 늘었다면 그 비용을 품질 향상이 상쇄하는지로 판단한다.
- 멀티는 서브에이전트를 Haiku로 다운시프트했으므로, 총 토큰이 늘어도 실제 비용(단가 반영)은 단일(전량 Opus)보다 낮을 수 있다 — cost-optimization.md 참고.
`;

  writeFileSync("ab-results.md", report, "utf8");
  console.log("\n→ ab-results.md 저장");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
