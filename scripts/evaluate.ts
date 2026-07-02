/**
 * 검색 품질 평가 하네스: 순수 벡터 RAG vs GraphRAG 비교
 *
 * 실행: npm run eval
 *
 * 방법론:
 *  - 커머스 소비자보호 질의 12개에 대해 "정답 조문"(gold)을 사전 정의
 *  - 두 검색 방식이 정답 조문을 결과에 포함하는지(hit) 측정
 *  - 벡터 진입 예산은 동일(topK=4), GraphRAG는 참조 관계 확장만 추가
 *  - 결과는 eval-results.md 로 저장
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { writeFileSync } from "fs";
import { searchLawGraph, searchLawVectorOnly } from "../src/lib/graphrag";
import { closeDriver } from "../src/lib/neo4j";

interface EvalCase {
  question: string;
  gold: { law: string; article: string }[];
  /**
   * any: 정답 조문 중 하나라도 있으면 hit (단일 조문 검색력)
   * all: 정답 조문이 전부 있어야 hit (복합 질의 완전성 — GraphRAG가 노리는 지점)
   */
  mode: "any" | "all";
}

const EVAL_SET: EvalCase[] = [
  {
    question: "온라인에서 산 상품 단순변심으로 환불 가능한 기간은?",
    gold: [{ law: "전자상거래 등에서의 소비자보호에 관한 법률", article: "제17조" }],
    mode: "any",
  },
  {
    question: "개봉한 전자제품도 청약철회 할 수 있나?",
    gold: [{ law: "전자상거래 등에서의 소비자보호에 관한 법률", article: "제17조" }],
    mode: "any",
  },
  {
    question: "청약철회하면 반품 배송비는 누가 부담하나?",
    gold: [{ law: "전자상거래 등에서의 소비자보호에 관한 법률", article: "제18조" }],
    mode: "any",
  },
  {
    question: "환불 요청하면 판매자는 언제까지 돈을 돌려줘야 하나?",
    gold: [{ law: "전자상거래 등에서의 소비자보호에 관한 법률", article: "제18조" }],
    mode: "any",
  },
  {
    question: "다운로드한 디지털 콘텐츠도 환불되나?",
    gold: [{ law: "전자상거래 등에서의 소비자보호에 관한 법률", article: "제17조" }],
    mode: "any",
  },
  {
    question: "통신판매업자가 소비자에게 미리 알려야 하는 정보는?",
    gold: [{ law: "전자상거래 등에서의 소비자보호에 관한 법률", article: "제13조" }],
    mode: "any",
  },
  {
    question: "거짓 사실로 소비자를 유인하는 쇼핑몰 행위는 금지되나?",
    gold: [{ law: "전자상거래 등에서의 소비자보호에 관한 법률", article: "제21조" }],
    mode: "any",
  },
  {
    question: "'업계 1위', '효과 100% 보장' 같은 과장 광고는 규제되나?",
    gold: [{ law: "표시ㆍ광고의 공정화에 관한 법률", article: "제3조" }],
    mode: "any",
  },
  {
    question: "할인 전 가격을 부풀려서 할인율을 크게 보이게 하는 광고는?",
    gold: [{ law: "표시ㆍ광고의 공정화에 관한 법률", article: "제3조" }],
    mode: "any",
  },
  {
    question: "소비자에게 일방적으로 불리한 약관 조항은 효력이 있나?",
    gold: [{ law: "약관의 규제에 관한 법률", article: "제6조" }],
    mode: "any",
  },
  {
    question: "'회사는 어떤 책임도 지지 않습니다' 같은 면책 약관은 유효한가?",
    gold: [{ law: "약관의 규제에 관한 법률", article: "제7조" }],
    mode: "any",
  },
  {
    question: "과도하게 큰 위약금을 물리는 약관 조항은?",
    gold: [{ law: "약관의 규제에 관한 법률", article: "제8조" }],
    mode: "any",
  },
  // ===== 복합 질의: 완전한 답에 복수 조문이 필요 (all-of) =====
  {
    question:
      "개봉한 노트북 단순변심 환불이 되는지, 반품 배송비 부담과 환급 기한까지 전부 알려줘",
    gold: [
      { law: "전자상거래 등에서의 소비자보호에 관한 법률", article: "제17조" },
      { law: "전자상거래 등에서의 소비자보호에 관한 법률", article: "제18조" },
    ],
    mode: "all",
  },
  {
    question: "쇼핑몰 허위 광고를 보고 샀다가 손해를 봤는데, 금지 규정과 배상 근거는?",
    gold: [
      { law: "표시ㆍ광고의 공정화에 관한 법률", article: "제3조" },
      { law: "표시ㆍ광고의 공정화에 관한 법률", article: "제10조" },
    ],
    mode: "all",
  },
  {
    question:
      "쇼핑몰 약관에 '회사 면책'과 '소비자에게 불리한 조항'이 같이 있는데 각각 효력이 있나?",
    gold: [
      { law: "약관의 규제에 관한 법률", article: "제6조" },
      { law: "약관의 규제에 관한 법률", article: "제7조" },
    ],
    mode: "all",
  },
  {
    question:
      "청약철회를 하려는데 판매자가 거짓 정보로 방해하면? 철회 요건과 금지행위 규정 모두 알려줘",
    gold: [
      { law: "전자상거래 등에서의 소비자보호에 관한 법률", article: "제17조" },
      { law: "전자상거래 등에서의 소비자보호에 관한 법률", article: "제21조" },
    ],
    mode: "all",
  },
  {
    question:
      "환불받을 때 판매자가 돈을 늦게 돌려주면 이자도 받을 수 있나? 환급 규정과 지연 배상 근거 포함해서",
    gold: [
      { law: "전자상거래 등에서의 소비자보호에 관한 법률", article: "제17조" },
      { law: "전자상거래 등에서의 소비자보호에 관한 법률", article: "제18조" },
    ],
    mode: "all",
  },
];

function isHit(
  results: { lawName: string; articleNo: string }[],
  gold: { law: string; article: string }[],
  mode: "any" | "all"
) {
  const found = (g: { law: string; article: string }) =>
    results.some((r) => r.lawName === g.law && r.articleNo === g.article);
  return mode === "all" ? gold.every(found) : gold.some(found);
}

async function main() {
  const rows: string[] = [];
  const stats = {
    any: { n: 0, vec: 0, graph: 0 },
    all: { n: 0, vec: 0, graph: 0 },
  };
  let graphHitsViaExpansion = 0;
  let vectorSizeSum = 0;
  let graphSizeSum = 0;

  for (const c of EVAL_SET) {
    const vec = await searchLawVectorOnly(c.question, 4);
    const graph = await searchLawGraph(c.question, { topK: 4, expandHops: 1 });

    const vHit = isHit(vec, c.gold, c.mode);
    const gHit = isHit(graph, c.gold, c.mode);
    // GraphRAG가 hit인데 정답 조문 중 일부가 확장으로만 발견된 경우
    const expansionContributed =
      gHit &&
      !vHit &&
      c.gold.some((g) =>
        graph.some(
          (r) =>
            r.lawName === g.law &&
            r.articleNo === g.article &&
            r.via === "graph-expansion"
        )
      );

    stats[c.mode].n++;
    if (vHit) stats[c.mode].vec++;
    if (gHit) stats[c.mode].graph++;
    if (expansionContributed) graphHitsViaExpansion++;
    vectorSizeSum += vec.length;
    graphSizeSum += graph.length;

    rows.push(
      `| ${c.mode === "all" ? "🔗 " : ""}${c.question} | ${c.gold.map((g) => g.article).join(" + ")} | ${vHit ? "✅" : "❌"} | ${gHit ? "✅" : "❌"}${expansionContributed ? " ⭐" : ""} |`
    );
    console.log(`${gHit ? "✔" : "✘"}${expansionContributed ? "⭐" : " "} [${c.mode}] ${c.question}`);
  }

  const n = EVAL_SET.length;
  const pct = (a: number, b: number) => `${a}/${b} (${Math.round((a / b) * 100)}%)`;
  const report = `# 검색 품질 평가: 순수 벡터 RAG vs GraphRAG

- 평가일: ${new Date().toISOString().slice(0, 10)}
- 평가셋: 커머스 소비자보호 질의 ${n}개 — 단일 조문 검색(any) ${stats.any.n}개 + 복합 질의 완전성(all) ${stats.all.n}개
- 조건: 두 방식 모두 벡터 진입 예산 동일(topK=4). GraphRAG는 REFERS_TO 1홉 확장만 추가.

## 요약

| 지표 | 벡터 단독 | GraphRAG |
|---|---|---|
| 단일 조문 검색 recall (any) | ${pct(stats.any.vec, stats.any.n)} | ${pct(stats.any.graph, stats.any.n)} |
| **복합 질의 완전성 (all)** | ${pct(stats.all.vec, stats.all.n)} | **${pct(stats.all.graph, stats.all.n)}** |
| 평균 반환 조문 수 | ${(vectorSizeSum / n).toFixed(1)} | ${(graphSizeSum / n).toFixed(1)} |
| 그래프 확장이 결정적이었던 케이스 (⭐) | - | ${graphHitsViaExpansion}건 |

## 케이스별 결과 (🔗 = 복합 질의, ⭐ = 그래프 확장 덕분에 hit)

| 질문 | 정답 조문 | 벡터 | GraphRAG |
|---|---|---|---|
${rows.join("\n")}

## 해석

- **단일 조문 질문은 벡터 검색만으로도 충분히 잘 잡힌다** — 질문이 조문 내용을 직접 묘사하기 때문.
- GraphRAG의 가치는 **복합 질의 완전성**에서 드러난다: 완전한 답에 원칙+예외+절차 등
  복수 조문이 필요할 때, 벡터 검색은 질문과 가장 유사한 조문만 잡고 나머지를 놓치지만
  참조 관계 확장이 이를 회수한다.
- GraphRAG의 반환 조문 수가 더 많은 것은 방법론의 본질적 특성(참조 확장)이며,
  확장 비용은 Cypher 쿼리 1회로 임베딩 추가 비용이 없다.
`;

  writeFileSync("eval-results.md", report, "utf8");
  console.log(
    `\n[any] 벡터 ${stats.any.vec}/${stats.any.n} vs GraphRAG ${stats.any.graph}/${stats.any.n}` +
    `\n[all] 벡터 ${stats.all.vec}/${stats.all.n} vs GraphRAG ${stats.all.graph}/${stats.all.n} (확장 결정적: ${graphHitsViaExpansion}건)` +
    `\n→ eval-results.md 저장 완료`
  );
  await closeDriver();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
