"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface Trace {
  kind: string;
  type?: string;
  name?: string;
  summary?: string;
  passed?: boolean;
}

interface Row {
  id: string;
  created_at: string;
  question: string;
  answer: string;
  traces: Trace[] | null;
  usage: { input_tokens: number; output_tokens: number; cache_read?: number } | null;
}

interface TopArticle {
  law: string;
  article: string;
  title: string;
  refs: number;
}

// Claude Opus 4.8 단가 기준 개략 비용 (USD/1M tokens)
const PRICE_IN = 5;
const PRICE_OUT = 25;

// 도구 이름 → 사람이 읽는 라벨 (평가자 혼동 방지)
const TOOL_LABELS: Record<string, string> = {
  search_products: "🛒 상품 검색 (네이버 쇼핑)",
  search_reviews: "📝 후기 검색 (네이버 블로그)",
  search_law: "⚖️ 법령 검색 (GraphRAG)",
};

// 니즈 분석용 키워드 카테고리
const NEED_CATEGORIES: { label: string; kws: RegExp }[] = [
  { label: "환불·청약철회", kws: /환불|청약철회|반품/ },
  { label: "교환·하자", kws: /교환|하자|불량|고장/ },
  { label: "상품 추천", kws: /추천|골라|찾아|사려|살까/ },
  { label: "상품 비교", kws: /비교|vs|차이|어떤 게/ },
  { label: "광고·표시 규제", kws: /광고|과장|표시|최저가/ },
  { label: "약관·계약", kws: /약관|계약|면책|위약금/ },
];

export default function AdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);
  const [topArticles, setTopArticles] = useState<TopArticle[]>([]);
  const [scale, setScale] = useState<{ laws: number; articles: number; refs: number } | null>(null);

  useEffect(() => {
    if (SUPABASE_URL && SUPABASE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      supabase
        .from("conversations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200)
        .then(({ data }) => {
          setRows((data as Row[]) ?? []);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
    // 법령 그래프 인사이트 (서버 API, 대화 로그와 무관하게 항상 표시)
    fetch("/api/insights")
      .then((r) => r.json())
      .then((d) => {
        if (d.topArticles) setTopArticles(d.topArticles);
        if (d.scale) setScale(d.scale);
      })
      .catch(() => {});
  }, []);

  const totalIn = rows.reduce((s, r) => s + (r.usage?.input_tokens ?? 0), 0);
  const totalOut = rows.reduce((s, r) => s + (r.usage?.output_tokens ?? 0), 0);
  const totalCacheRead = rows.reduce((s, r) => s + (r.usage?.cache_read ?? 0), 0);
  const cost = (totalIn * PRICE_IN + totalOut * PRICE_OUT) / 1_000_000;

  const toolCounts: Record<string, number> = {};
  for (const r of rows) {
    for (const t of r.traces ?? []) {
      if (t.kind === "tool_use" && t.name) {
        toolCounts[t.name] = (toolCounts[t.name] ?? 0) + 1;
      }
    }
  }
  const toolTotal = Object.values(toolCounts).reduce((a, b) => a + b, 0) || 1;

  // 니즈 분석: 질문을 카테고리로 분류 (키워드 기반, 다중 매칭 허용)
  const needCounts = NEED_CATEGORIES.map((c) => ({
    label: c.label,
    count: rows.filter((r) => c.kws.test(r.question)).length,
  })).sort((a, b) => b.count - a.count);
  const needMax = Math.max(1, ...needCounts.map((n) => n.count));

  // 신뢰성 지표: 트레이스에서 인용 검증 결과·캐시 히트 집계
  let verifyPass = 0;
  let verifyTotal = 0;
  let cacheHits = 0;
  for (const r of rows) {
    for (const t of r.traces ?? []) {
      if (t.type === "verify_result") {
        verifyTotal++;
        if (t.passed) verifyPass++;
      }
      if (t.type === "cache_hit") cacheHits++;
    }
  }
  const verifyRate = verifyTotal ? Math.round((verifyPass / verifyTotal) * 100) : null;

  // 미충족 수요: 에이전트가 완전히 답하지 못한 대화 (답변에 불확실/미검색 신호)
  const UNMET_SIGNAL = /(찾지 못했|찾지못했|확인 불가|확인이 필요|검색되지 않|해당 상품이 없|조건의 상품)/;
  const unmet = rows.filter(
    (r) =>
      UNMET_SIGNAL.test(r.answer ?? "") ||
      (r.traces ?? []).some((t) => t.type === "verify_result" && t.passed === false)
  );

  return (
    <div className="min-h-screen bg-zinc-50 px-8 py-6 text-zinc-900">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="text-xl font-bold">커머스 인텔리전스 대시보드</h1>
            <p className="text-sm text-zinc-500">
              핵심 법령 조문 · 고객 니즈 분석 · 신뢰성 지표 · 대화 로그 · 비용 관측
            </p>
          </div>
          <a href="/" className="text-sm text-blue-600 hover:underline">
            ← 채팅으로
          </a>
        </header>

        {/* 지표 카드 */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="총 대화 수" value={rows.length.toLocaleString()} />
          <StatCard
            label="총 토큰 (입력/출력)"
            value={`${totalIn.toLocaleString()} / ${totalOut.toLocaleString()}`}
          />
          <StatCard
            label="캐시 히트 토큰"
            value={totalCacheRead.toLocaleString()}
            hint="프롬프트 캐싱 절감분"
          />
          <StatCard label="누적 비용 (개략)" value={`$${cost.toFixed(3)}`} />
        </div>

        {/* 도구 사용 분포 */}
        <section className="mb-6 rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-bold text-zinc-600">에이전트 도구 호출 분포</h2>
          <p className="mb-3 text-[11px] text-zinc-400">
            전문 에이전트가 호출한 도구(함수)별 빈도 — 에이전트가 어떤 행동을 많이 하는지
          </p>
          {Object.keys(toolCounts).length === 0 && (
            <p className="text-sm text-zinc-400">아직 도구 호출 기록이 없습니다.</p>
          )}
          <div className="space-y-2">
            {Object.entries(toolCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => (
                <div key={name} className="flex items-center gap-3 text-sm">
                  <span className="w-52 shrink-0 text-xs">{TOOL_LABELS[name] ?? name}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-100">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${(count / toolTotal) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 text-right text-xs text-zinc-500">{count}</span>
                </div>
              ))}
          </div>
        </section>

        {/* 2단 인사이트: 핵심 법령 조문 + 니즈 분석 */}
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          {/* 핵심 법령 조문 랭킹 (그래프 중심성) */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-bold text-zinc-600">
              소비자 이슈 핵심 법령 조문
            </h2>
            <p className="mb-3 text-[11px] text-zinc-400">
              법령 지식그래프에서 다른 조문이 가장 많이 참조하는 조문 = 소비자 분쟁이 얽히는 핵심 조항
              {scale && ` (조문 ${scale.articles}개, 참조 ${scale.refs}개 그래프 기준)`}
            </p>
            {topArticles.length === 0 ? (
              <p className="text-sm text-zinc-400">불러오는 중…</p>
            ) : (
              <ol className="space-y-1.5">
                {topArticles.map((a, i) => (
                  <li key={a.law + a.article} className="flex items-center gap-2 text-sm">
                    <span className="w-5 shrink-0 text-right font-mono text-xs text-zinc-400">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate">
                      <span className="font-medium">{a.article}</span>{" "}
                      <span className="text-zinc-500">{a.title}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] text-purple-600">
                      {a.refs}회 참조
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* 니즈 분석 */}
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-bold text-zinc-600">고객 니즈 분석</h2>
            <p className="mb-3 text-[11px] text-zinc-400">
              실제 대화 질문을 카테고리로 분류 — 어떤 니즈가 많은지 (대화 {rows.length}건 기준)
            </p>
            {rows.length === 0 ? (
              <p className="text-sm text-zinc-400">대화 로그가 쌓이면 표시됩니다.</p>
            ) : (
              <div className="space-y-2">
                {needCounts.map((n) => (
                  <div key={n.label} className="flex items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 text-xs">{n.label}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-100">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${(n.count / needMax) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs text-zinc-500">{n.count}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* 신뢰성 지표 */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard
            label="법령 인용 검증 통과율"
            value={verifyRate === null ? "—" : `${verifyRate}%`}
            hint={verifyTotal ? `${verifyPass}/${verifyTotal}건 통과` : "검증 기록 없음"}
          />
          <StatCard
            label="의미 캐시 히트"
            value={cacheHits.toLocaleString()}
            hint="반복 법령 질문 재사용"
          />
          <StatCard
            label="PII 마스킹"
            value="적용 중"
            hint="카드·주민·전화·이메일 저장 전 마스킹"
          />
        </div>

        {/* 미충족 수요 — 에이전트가 완전히 답하지 못한 대화 = 개선/사업 기회 */}
        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <h2 className="text-sm font-bold text-amber-800">
            미충족 수요 · 개선 필요 대화
          </h2>
          <p className="mb-3 text-[11px] text-amber-700/70">
            에이전트가 상품을 못 찾았거나 법령 근거를 확정하지 못한 대화 — 데이터·법령 커버리지를 넓힐 기회
            {rows.length > 0 && ` (전체 ${rows.length}건 중 ${unmet.length}건)`}
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-amber-700/60">대화 로그가 쌓이면 표시됩니다.</p>
          ) : unmet.length === 0 ? (
            <p className="text-sm text-emerald-700">
              ✓ 최근 대화에서 미충족 사례가 없습니다.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {unmet.slice(0, 6).map((r) => (
                <li key={r.id} className="truncate text-sm text-amber-900">
                  • {r.question}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 대화 목록 */}
        <section className="rounded-xl border border-zinc-200 bg-white">
          <h2 className="border-b border-zinc-100 p-4 text-sm font-bold text-zinc-600">
            최근 대화 {loading && "(불러오는 중…)"}
          </h2>
          <ul className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <li
                key={r.id}
                onClick={() => setSelected(selected?.id === r.id ? null : r)}
                className="cursor-pointer px-4 py-3 hover:bg-zinc-50"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <span className="truncate text-sm font-medium">{r.question}</span>
                  <span className="shrink-0 text-xs text-zinc-400">
                    {new Date(r.created_at).toLocaleString("ko-KR")}
                  </span>
                </div>
                <div className="mt-0.5 flex gap-3 text-xs text-zinc-500">
                  <span>
                    도구 {(r.traces ?? []).filter((t) => t.kind === "tool_use").length}회
                  </span>
                  <span>
                    토큰 {r.usage?.input_tokens ?? 0}/{r.usage?.output_tokens ?? 0}
                  </span>
                </div>
                {selected?.id === r.id && (
                  <div className="mt-3 space-y-2 rounded-lg bg-zinc-50 p-3 text-xs">
                    <div>
                      <span className="font-semibold text-zinc-600">트레이스: </span>
                      {(r.traces ?? [])
                        .map((t) =>
                          t.kind === "tool_use" ? `→ ${t.name}` : `✔ ${t.summary}`
                        )
                        .join("  ")}
                    </div>
                    <p className="whitespace-pre-wrap text-zinc-600">
                      {r.answer?.slice(0, 600)}
                      {(r.answer?.length ?? 0) > 600 && "…"}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!loading && rows.length === 0 && (
            <p className="p-4 text-sm text-zinc-400">대화 기록이 없습니다.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
      {hint && <p className="text-[11px] text-zinc-400">{hint}</p>}
    </div>
  );
}
