"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type TraceEvent =
  | { kind: "iteration"; n: number }
  | { kind: "thinking"; text: string }
  | { kind: "agent_start"; agent: string; label: string; task: string }
  | { kind: "agent_done"; agent: string; label: string; usage?: { input_tokens: number; output_tokens: number } }
  | { kind: "verify_start"; agent: string }
  | {
      kind: "verify_result";
      agent: string;
      passed: boolean;
      revised?: boolean;
      verdicts: { citation: string; supported: boolean; reason: string }[];
    }
  | { kind: "tool_use"; id: string; name: string; input: unknown; agent?: string }
  | { kind: "tool_result"; id: string; name: string; summary: string; result: unknown; agent?: string };

const TOOL_LABELS: Record<string, string> = {
  search_products: "🛒 상품 검색",
  search_reviews: "📝 후기 검색",
  search_law: "⚖️ 법령 그래프 검색",
};

const AGENT_META: Record<string, { icon: string; color: string }> = {
  shopping: { icon: "🛒", color: "border-blue-700 bg-blue-950" },
  law: { icon: "⚖️", color: "border-purple-700 bg-purple-950" },
};

const EXAMPLES = [
  "장마철 원룸에서 쓸 제습기 10만원 이하로 추천해줘",
  "온라인에서 산 노트북 개봉했는데 환불 가능해?",
  "'전국 최저가 보장'이라고 광고 문구 써도 돼?",
  "캠핑용 버너 2개만 비교해서 추천해줘",
];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [traces, setTraces] = useState<TraceEvent[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showTrace, setShowTrace] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setTraces([]);
    setSuggestions([]);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) throw new Error(`요청 실패: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          handleEvent(JSON.parse(part.slice(6)));
        }
      }
    } catch (e) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: `오류가 발생했습니다: ${e instanceof Error ? e.message : e}`,
        };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }

  function handleEvent(event: Record<string, unknown>) {
    switch (event.type) {
      case "text_delta":
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = {
            ...last,
            content: last.content + (event.text as string),
          };
          return next;
        });
        break;
      case "thinking_delta":
        setTraces((prev) => {
          const last = prev[prev.length - 1];
          if (last?.kind === "thinking") {
            return [
              ...prev.slice(0, -1),
              { kind: "thinking", text: last.text + (event.text as string) },
            ];
          }
          return [...prev, { kind: "thinking", text: event.text as string }];
        });
        break;
      case "iteration":
        setTraces((prev) => [...prev, { kind: "iteration", n: event.n as number }]);
        break;
      case "agent_start":
        setTraces((prev) => [
          ...prev,
          {
            kind: "agent_start",
            agent: event.agent as string,
            label: event.label as string,
            task: event.task as string,
          },
        ]);
        break;
      case "agent_done":
        setTraces((prev) => [
          ...prev,
          {
            kind: "agent_done",
            agent: event.agent as string,
            label: event.label as string,
            usage: event.usage as { input_tokens: number; output_tokens: number } | undefined,
          },
        ]);
        break;
      case "verify_start":
        setTraces((prev) => [
          ...prev,
          { kind: "verify_start", agent: event.agent as string },
        ]);
        break;
      case "verify_result":
        setTraces((prev) => [
          ...prev,
          {
            kind: "verify_result",
            agent: event.agent as string,
            passed: event.passed as boolean,
            revised: event.revised as boolean | undefined,
            verdicts:
              (event.verdicts as { citation: string; supported: boolean; reason: string }[]) ??
              [],
          },
        ]);
        break;
      case "tool_use":
        setTraces((prev) => [
          ...prev,
          {
            kind: "tool_use",
            id: event.id as string,
            name: event.name as string,
            input: event.input,
            agent: event.agent as string | undefined,
          },
        ]);
        break;
      case "tool_result":
        setTraces((prev) => [
          ...prev,
          {
            kind: "tool_result",
            id: event.id as string,
            name: event.name as string,
            summary: event.summary as string,
            result: event.result,
            agent: event.agent as string | undefined,
          },
        ]);
        break;
      case "suggestions":
        setSuggestions((event.items as string[]) ?? []);
        break;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="flex h-screen bg-zinc-50 text-zinc-900">
      {/* 채팅 영역 */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
          <div>
            <h1 className="text-lg font-bold">쇼핑 컨시어지</h1>
            <p className="text-xs text-zinc-500">
              상품 추천 · 비교 · 소비자권리(법령 GraphRAG) AI 에이전트
            </p>
          </div>
          <button
            onClick={() => setShowTrace(!showTrace)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100"
          >
            {showTrace ? "트레이스 숨기기" : "🔍 에이전트 트레이스"}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 && (
            <div className="mx-auto mt-16 max-w-lg text-center">
              <p className="mb-6 text-zinc-500">무엇을 도와드릴까요? 예시를 눌러보세요.</p>
              <div className="grid gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => send(ex)}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm hover:border-blue-400 hover:bg-blue-50"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[80%] rounded-2xl bg-blue-600 px-4 py-2.5 text-white"
                      : "markdown-body rounded-2xl border border-zinc-200 bg-white px-5 py-4 text-sm leading-relaxed"
                  }
                >
                  {m.role === "user" ? (
                    m.content
                  ) : m.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  ) : (
                    <span className="animate-pulse text-zinc-400">
                      에이전트가 판단 중입니다…
                    </span>
                  )}
                </div>
              </div>
            ))}
            {/* 후속 유도질문 칩 (작은 박스) */}
            {suggestions.length > 0 && !streaming && (
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="w-full text-xs text-zinc-400">이어서 물어보기</span>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700 hover:border-blue-400 hover:bg-blue-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </main>

        <footer className="border-t border-zinc-200 bg-white px-6 py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="mx-auto flex max-w-3xl gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="예: 자취 시작하는데 20만원 이하 로봇청소기 추천해줘"
              className="flex-1 rounded-xl border border-zinc-300 px-4 py-2.5 outline-none focus:border-blue-400"
              disabled={streaming}
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="rounded-xl bg-blue-600 px-5 py-2.5 font-medium text-white disabled:opacity-40"
            >
              {streaming ? "…" : "전송"}
            </button>
          </form>
        </footer>
      </div>

      {/* 에이전트 트레이스 패널 */}
      {showTrace && (
        <aside className="w-96 overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-4 text-zinc-100">
          <h2 className="mb-3 text-sm font-bold text-zinc-400">
            에이전트 판단·행동 트레이스
          </h2>
          {traces.length === 0 && (
            <p className="text-xs text-zinc-500">
              질문을 보내면 에이전트의 사고 과정, 도구 호출, 그래프 탐색 경로가 여기에
              실시간으로 표시됩니다.
            </p>
          )}
          <div className="space-y-2">
            {traces.map((t, i) => {
              switch (t.kind) {
                case "iteration":
                  return (
                    <div
                      key={i}
                      className="pt-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500"
                    >
                      — 오케스트레이터 루프 {t.n}회차 —
                    </div>
                  );
                case "thinking":
                  return (
                    <div key={i} className="rounded-lg bg-zinc-800 p-2.5 text-xs text-zinc-400">
                      <span className="mb-1 block font-semibold text-zinc-500">
                        💭 오케스트레이터 판단
                      </span>
                      {t.text}
                    </div>
                  );
                case "agent_start":
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border p-2.5 text-xs ${AGENT_META[t.agent]?.color ?? "border-zinc-700 bg-zinc-800"}`}
                    >
                      <span className="font-bold">
                        {AGENT_META[t.agent]?.icon} {t.label} 시작
                      </span>
                      <p className="mt-1 text-[11px] opacity-80">위임 과제: {t.task}</p>
                    </div>
                  );
                case "agent_done":
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border p-2 text-[11px] ${AGENT_META[t.agent]?.color ?? "border-zinc-700 bg-zinc-800"}`}
                    >
                      <span className="font-semibold">
                        {AGENT_META[t.agent]?.icon} {t.label} 완료
                        {t.usage &&
                          ` · 토큰 ${t.usage.input_tokens}/${t.usage.output_tokens}`}
                      </span>
                    </div>
                  );
                case "verify_start":
                  return (
                    <div
                      key={i}
                      className="ml-4 rounded-lg border border-amber-700 bg-amber-950 p-2 text-[11px] text-amber-200"
                    >
                      🛡️ 인용 검증 중… (조문 실존 대조 + 크리틱 반박 시도)
                    </div>
                  );
                case "verify_result":
                  return (
                    <div
                      key={i}
                      className={`ml-4 rounded-lg border p-2.5 text-xs ${t.passed ? "border-emerald-700 bg-emerald-950 text-emerald-200" : "border-amber-700 bg-amber-950 text-amber-200"}`}
                    >
                      <span className="font-bold">
                        {t.passed
                          ? `🛡️ 인용 검증 통과 (${t.verdicts.length}건 확인)`
                          : `🛡️ 검증 실패 인용 발견 → 보고서 수정됨`}
                      </span>
                      {t.verdicts.some((v) => !v.supported) && (
                        <ul className="mt-1 space-y-0.5 text-[11px] opacity-80">
                          {t.verdicts
                            .filter((v) => !v.supported)
                            .map((v, j) => (
                              <li key={j}>
                                ✘ {v.citation}: {v.reason}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  );
                case "tool_use":
                  return (
                    <div
                      key={i}
                      className={`ml-4 rounded-lg border p-2.5 text-xs ${t.agent ? (AGENT_META[t.agent]?.color ?? "") : "border-blue-800 bg-blue-950"}`}
                    >
                      <span className="font-semibold">{TOOL_LABELS[t.name] ?? t.name}</span>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] opacity-70">
                        {JSON.stringify(t.input, null, 2)}
                      </pre>
                    </div>
                  );
                case "tool_result":
                  return (
                    <div
                      key={i}
                      className="ml-4 rounded-lg border border-emerald-800 bg-emerald-950 p-2.5 text-xs"
                    >
                      <span className="font-semibold text-emerald-300">✔ {t.summary}</span>
                      {t.name === "search_law" && Array.isArray(t.result) && (
                        <ul className="mt-1.5 space-y-1 text-[11px] text-emerald-200">
                          {(
                            t.result as {
                              law: string;
                              article: string;
                              via: string;
                              expandedFrom?: string;
                            }[]
                          ).map((a, j) => (
                            <li key={j}>
                              {a.via === "graph-expansion" ? "└→ " : "• "}
                              {a.law} {a.article}
                              {a.via === "graph-expansion" && (
                                <span className="text-emerald-500"> (참조 확장)</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
              }
            })}
          </div>
        </aside>
      )}
    </div>
  );
}
