/**
 * 재검색 재위임 회귀 테스트 — 프롬프트 준수에 의존하는 규칙을 자동으로 지켜본다.
 *
 * 실행: npm run test-redelegate   (ANTHROPIC_API_KEY만 필요 — 네이버/Neo4j 불필요)
 *
 * 검증 대상 규칙 (ORCHESTRATOR_SYSTEM):
 *   "재검색·조건 변경 요청은 반드시 다시 위임한다" — '더 저렴한 걸로' 같은 요청에
 *   오케스트레이터가 직접 답하면(도구 미호출) 상품 정보를 지어내게 되므로 금지.
 *
 * 방법: 이전 턴(추천 답변)을 히스토리로 위조해 넣고 후속 요청을 보낸 뒤,
 *       오케스트레이터의 "첫 행동"이 올바른 위임(tool_use)인지 확인한다.
 *       서브에이전트를 실제로 돌리지 않으므로 케이스당 모델 호출 1회로 저렴하다.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";
import { ORCHESTRATOR_SYSTEM, ORCHESTRATOR_TOOLS } from "../src/lib/agents";

const client = new Anthropic();
const MODEL = "claude-sonnet-5"; // route.ts의 오케스트레이터와 동일 모델

/** 이전 턴을 위조한 추천 답변 (실제 서비스 답변 형태 축약) */
const PRIOR_ANSWER = `## 추천 결과
3~5만원대 선풍기 3종을 비교했습니다.

| 상품 | 가격 | 특징 |
|---|---|---|
| A사 스탠드 선풍기 | 49,000원 | 리모컨, 타이머 |
| B사 서큘레이터 | 38,500원 | 강풍, 소음 있음 |
| C사 미니 선풍기 | 32,000원 | 저소음, 탁상용 |

후기 기준 C사가 저소음으로 호평입니다.`;

interface Case {
  name: string;
  history: Anthropic.MessageParam[];
  /** 기대: 첫 행동이 이 도구의 호출이어야 함. null이면 "도구 없이 직접 답해도 됨" */
  expectTool: string | null;
}

const CASES: Case[] = [
  {
    name: "가격 조건 변경 → delegate_shopping 재위임",
    history: [
      { role: "user", content: "3만원에서 5만원 사이 선풍기 추천해줘" },
      { role: "assistant", content: PRIOR_ANSWER },
      { role: "user", content: "더 저렴한 걸로 다시 추천해줘" },
    ],
    expectTool: "delegate_shopping",
  },
  {
    name: "기능 조건 변경 → delegate_shopping 재위임",
    history: [
      { role: "user", content: "3만원에서 5만원 사이 선풍기 추천해줘" },
      { role: "assistant", content: PRIOR_ANSWER },
      { role: "user", content: "무소음 위주로 다시 비교해줘" },
    ],
    expectTool: "delegate_shopping",
  },
  {
    name: "추천 이후 법령 후속 질문 → delegate_law 위임",
    history: [
      { role: "user", content: "3만원에서 5만원 사이 선풍기 추천해줘" },
      { role: "assistant", content: PRIOR_ANSWER },
      { role: "user", content: "이거 사고 나서 개봉하면 환불 안 돼?" },
    ],
    expectTool: "delegate_law",
  },
  {
    name: "단순 인사 → 위임 불필요 (직접 응답 허용)",
    history: [{ role: "user", content: "안녕!" }],
    expectTool: null,
  },
];

async function run() {
  let pass = 0;
  let fail = 0;

  for (const c of CASES) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: [{ type: "text", text: ORCHESTRATOR_SYSTEM }],
      tools: ORCHESTRATOR_TOOLS,
      messages: c.history,
    });

    const toolUse = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    const actual = toolUse?.name ?? null;
    const ok = actual === c.expectTool;

    if (ok) {
      pass++;
      console.log(`✔ ${c.name}`);
      if (toolUse) console.log(`    위임 task: ${String((toolUse.input as { task?: string }).task ?? "").slice(0, 80)}…`);
    } else {
      fail++;
      console.error(`✘ ${c.name}`);
      console.error(`    기대: ${c.expectTool ?? "(도구 없음)"} / 실제: ${actual ?? "(도구 없음 — 직접 답변)"}`);
    }
  }

  console.log(`\n결과: ${pass}/${CASES.length} 통과`);
  process.exit(fail ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
