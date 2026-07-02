"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Row {
  id: string;
  created_at: string;
  question: string;
  answer: string;
  traces: { kind: string; name?: string; summary?: string }[] | null;
  usage: { input_tokens: number; output_tokens: number; cache_read?: number } | null;
}

// Claude Opus 4.8 단가 기준 개략 비용 (USD/1M tokens)
const PRICE_IN = 5;
const PRICE_OUT = 25;

export default function AdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);

  useEffect(() => {
    supabase
      .from("conversations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setRows((data as Row[]) ?? []);
        setLoading(false);
      });
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

  return (
    <div className="min-h-screen bg-zinc-50 px-8 py-6 text-zinc-900">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="text-xl font-bold">운영 대시보드</h1>
            <p className="text-sm text-zinc-500">대화 로그 · 도구 사용 · 비용 관측</p>
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
          <h2 className="mb-3 text-sm font-bold text-zinc-600">도구 호출 분포</h2>
          {Object.keys(toolCounts).length === 0 && (
            <p className="text-sm text-zinc-400">아직 도구 호출 기록이 없습니다.</p>
          )}
          <div className="space-y-2">
            {Object.entries(toolCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => (
                <div key={name} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0 font-mono text-xs">{name}</span>
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
