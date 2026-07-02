"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Product {
  title: string;
  price: number;
  mall: string;
  brand?: string;
  image?: string;
  link: string;
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
  search_products: "상품 검색 · 네이버 쇼핑",
  search_reviews: "후기 검색 · 네이버 블로그",
  search_law: "법령 검색 · GraphRAG",
};

const AGENT_META: Record<string, { icon: string; accent: string; bg: string }> = {
  shopping: { icon: "🛒", accent: "#03c75a", bg: "#e8f8ee" },
  law: { icon: "⚖️", accent: "#8b5cf6", bg: "#f3f0ff" },
};

const EXAMPLE_GROUPS: { icon: string; label: string; desc: string; items: string[] }[] = [
  {
    icon: "🛒",
    label: "상품 추천 · 비교",
    desc: "상황을 말하면 조건에 맞는 상품을 찾아 비교",
    items: [
      "장마철 원룸에서 쓸 제습기 10만원 이하로 추천해줘",
      "캠핑용 버너 2개만 비교해서 추천해줘",
    ],
  },
  {
    icon: "⚖️",
    label: "소비자 권리 · 법령",
    desc: "환불·교환·광고 규제를 법 조문 근거로 안내",
    items: [
      "온라인에서 산 노트북 개봉했는데 환불 가능해?",
      "'전국 최저가 보장'이라고 광고 문구 써도 돼?",
    ],
  },
];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [traces, setTraces] = useState<TraceEvent[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, products, suggestions]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setTraces([]);
    setSuggestions([]);
    setProducts([]);
    setInput("");
    setStreaming(true);
    if (traces.length === 0) setShowTrace(true);

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
          content: `⚠️ 오류가 발생했습니다: ${e instanceof Error ? e.message : e}`,
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
          next[next.length - 1] = { ...last, content: last.content + (event.text as string) };
          return next;
        });
        break;
      case "thinking_delta":
        setTraces((prev) => {
          const last = prev[prev.length - 1];
          if (last?.kind === "thinking") {
            return [...prev.slice(0, -1), { kind: "thinking", text: last.text + (event.text as string) }];
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
          { kind: "agent_start", agent: event.agent as string, label: event.label as string, task: event.task as string },
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
        setTraces((prev) => [...prev, { kind: "verify_start", agent: event.agent as string }]);
        break;
      case "verify_result":
        setTraces((prev) => [
          ...prev,
          {
            kind: "verify_result",
            agent: event.agent as string,
            passed: event.passed as boolean,
            revised: event.revised as boolean | undefined,
            verdicts: (event.verdicts as { citation: string; supported: boolean; reason: string }[]) ?? [],
          },
        ]);
        break;
      case "tool_use":
        setTraces((prev) => [
          ...prev,
          { kind: "tool_use", id: event.id as string, name: event.name as string, input: event.input, agent: event.agent as string | undefined },
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
        if (event.name === "search_products" && Array.isArray(event.result)) {
          setProducts((prev) => {
            const seen = new Set(prev.map((p) => p.link));
            const added = (event.result as Product[]).filter((p) => p.link && !seen.has(p.link));
            return [...prev, ...added];
          });
        }
        break;
      case "suggestions":
        setSuggestions((event.items as string[]) ?? []);
        break;
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-screen bg-[#f7f8fa] text-[#191919]">
      <div className="flex flex-1 flex-col">
        {/* 상단 네비게이션 */}
        <header className="z-10 flex items-center justify-between border-b border-[#eaecef] bg-white/90 px-5 py-2.5 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#03c75a] font-black text-white shadow-sm">
              쇼
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-1.5 text-[15px] font-bold">
                쇼핑 컨시어지
                <span className="rounded bg-[#e8f8ee] px-1.5 py-0.5 text-[10px] font-semibold text-[#02b350]">
                  BETA
                </span>
              </div>
              <p className="text-[11px] text-[#767676]">AI 커머스 에이전트 · 상품추천 + 소비자권리</p>
            </div>
          </div>
          <nav className="flex items-center gap-1.5">
            <button
              onClick={() => setShowTrace((v) => !v)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                showTrace ? "bg-[#03c75a] text-white" : "text-[#4b4b4b] hover:bg-[#f1f3f5]"
              }`}
            >
              {showTrace ? "판단 과정 ✓" : "🔍 판단 과정"}
            </button>
            <a
              href="/admin"
              className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#4b4b4b] hover:bg-[#f1f3f5]"
            >
              📊 대시보드
            </a>
          </nav>
        </header>

        {/* 본문 */}
        <main className="flex-1 overflow-y-auto">
          {empty ? (
            <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-5 py-10">
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#03c75a] text-2xl shadow-lg shadow-green-200">
                  🛍️
                </div>
                <h1 className="text-2xl font-bold tracking-tight">무엇을 도와드릴까요?</h1>
                <p className="mt-2 text-sm text-[#767676]">
                  상품을 찾아주고, 환불·교환 같은 소비자 권리를 법 조문 근거로 알려드려요.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {EXAMPLE_GROUPS.map((g) => (
                  <div key={g.label} className="rounded-2xl border border-[#eaecef] bg-white p-4 shadow-sm">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-lg">{g.icon}</span>
                      <span className="text-sm font-bold">{g.label}</span>
                    </div>
                    <p className="mb-3 text-[11px] text-[#767676]">{g.desc}</p>
                    <div className="space-y-2">
                      {g.items.map((ex) => (
                        <button
                          key={ex}
                          onClick={() => send(ex)}
                          className="w-full rounded-xl bg-[#f7f8fa] px-3 py-2.5 text-left text-[13px] leading-snug text-[#333] transition hover:bg-[#e8f8ee] hover:text-[#02b350]"
                        >
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[82%] rounded-2xl rounded-tr-md bg-[#03c75a] px-4 py-2.5 text-[14px] leading-relaxed text-white shadow-sm">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex gap-2.5">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e8f8ee] text-sm">
                      🛍️
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="rounded-2xl rounded-tl-md border border-[#eaecef] bg-white px-4 py-3 shadow-sm">
                        {m.content ? (
                          <div className="markdown-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 py-1">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="ml-2 text-[13px] text-[#767676]">
                              에이전트가 판단하고 있어요
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 상품 카드 (마지막 어시스턴트 메시지 아래) */}
                      {i === messages.length - 1 && products.length > 0 && (
                        <div className="fade-in mt-3">
                          <p className="mb-2 flex items-center gap-1 text-[12px] font-semibold text-[#767676]">
                            <span className="text-[#03c75a]">●</span> 네이버 쇼핑 검색 결과 {products.length}개
                          </p>
                          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                            {products.slice(0, 9).map((p) => (
                              <a
                                key={p.link}
                                href={p.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group overflow-hidden rounded-xl border border-[#eaecef] bg-white transition hover:border-[#03c75a] hover:shadow-md"
                              >
                                <div className="aspect-square overflow-hidden bg-[#f7f8fa]">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={p.image}
                                    alt={p.title}
                                    loading="lazy"
                                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                                  />
                                </div>
                                <div className="p-2.5">
                                  <p className="line-clamp-2 min-h-[2.4em] text-[12px] leading-snug text-[#333]">
                                    {p.title}
                                  </p>
                                  <p className="mt-1.5 text-[15px] font-bold text-[#191919]">
                                    {p.price.toLocaleString()}
                                    <span className="text-[12px] font-medium text-[#767676]"> 원</span>
                                  </p>
                                  <p className="mt-0.5 truncate text-[11px] text-[#03c75a]">{p.mall}</p>
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 후속 액션 카드 */}
                      {i === messages.length - 1 && suggestions.length > 0 && !streaming && (
                        <div className="fade-in mt-3">
                          <p className="mb-1.5 text-[12px] font-semibold text-[#767676]">
                            이어서 물어보기
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {suggestions.map((s) => (
                              <button
                                key={s}
                                onClick={() => send(s)}
                                className="rounded-full border border-[#d3f0dd] bg-[#f2fcf6] px-3.5 py-1.5 text-[13px] text-[#02b350] transition hover:border-[#03c75a] hover:bg-[#e8f8ee]"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </main>

        {/* 입력창 */}
        <div className="border-t border-[#eaecef] bg-white px-4 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="mx-auto flex max-w-2xl items-end gap-2"
          >
            <div className="flex flex-1 items-end rounded-2xl border border-[#dfe2e7] bg-[#f7f8fa] px-4 py-2 focus-within:border-[#03c75a] focus-within:bg-white">
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (taRef.current) {
                    taRef.current.style.height = "auto";
                    taRef.current.style.height = Math.min(taRef.current.scrollHeight, 120) + "px";
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder="예: 자취 시작하는데 20만원 이하 로봇청소기 추천해줘"
                className="max-h-[120px] flex-1 resize-none bg-transparent py-1 text-[14px] outline-none placeholder:text-[#a0a4ab]"
                disabled={streaming}
              />
            </div>
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#03c75a] text-white transition hover:bg-[#02b350] disabled:bg-[#c8ccd2]"
              aria-label="전송"
            >
              {streaming ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3.4 20.4L21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8z"
                    fill="currentColor"
                  />
                </svg>
              )}
            </button>
          </form>
          <p className="mx-auto mt-1.5 max-w-2xl text-center text-[11px] text-[#a0a4ab]">
            상품 정보·법령은 실시간 검색 결과 기반입니다. 법령 안내는 일반 정보이며 법률 자문이 아닙니다.
          </p>
        </div>
      </div>

      {/* 판단 과정 패널 */}
      {showTrace && (
        <aside className="hidden w-[340px] shrink-0 flex-col border-l border-[#eaecef] bg-white lg:flex">
          <div className="flex items-center justify-between border-b border-[#eaecef] px-4 py-3">
            <div>
              <h2 className="text-[13px] font-bold">에이전트 판단 과정</h2>
              <p className="text-[11px] text-[#767676]">어떤 흐름으로 판단·행동했는지</p>
            </div>
            <button onClick={() => setShowTrace(false)} className="text-[#a0a4ab] hover:text-[#191919]">
              ✕
            </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {traces.length === 0 && (
              <p className="px-1 pt-2 text-[12px] leading-relaxed text-[#a0a4ab]">
                질문을 보내면 오케스트레이터의 판단, 전문 에이전트 위임, 도구 호출, 법령 그래프 탐색이
                실시간으로 표시됩니다.
              </p>
            )}
            {traces.map((t, i) => {
              const meta = "agent" in t && t.agent ? AGENT_META[t.agent] : undefined;
              switch (t.kind) {
                case "iteration":
                  return (
                    <div key={i} className="px-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-[#b0b4bb]">
                      오케스트레이터 · {t.n}회차
                    </div>
                  );
                case "thinking":
                  return (
                    <div key={i} className="rounded-lg bg-[#f7f8fa] p-2.5 text-[12px] leading-relaxed text-[#767676]">
                      <span className="mb-1 block text-[11px] font-semibold text-[#a0a4ab]">💭 판단</span>
                      {t.text}
                    </div>
                  );
                case "agent_start":
                  return (
                    <div key={i} className="rounded-lg border p-2.5" style={{ borderColor: meta?.accent + "40", background: meta?.bg }}>
                      <div className="text-[12px] font-bold" style={{ color: meta?.accent }}>
                        {meta?.icon} {t.label} 시작
                      </div>
                      <p className="mt-1 line-clamp-3 text-[11px] text-[#767676]">위임: {t.task}</p>
                    </div>
                  );
                case "agent_done":
                  return (
                    <div key={i} className="rounded-lg border p-2 text-[11px] font-semibold" style={{ borderColor: meta?.accent + "40", background: meta?.bg, color: meta?.accent }}>
                      {meta?.icon} {t.label} 완료
                      {t.usage ? ` · ${t.usage.input_tokens}/${t.usage.output_tokens} 토큰` : ""}
                    </div>
                  );
                case "verify_start":
                  return (
                    <div key={i} className="ml-3 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-700">
                      🛡️ 인용 검증 중…
                    </div>
                  );
                case "verify_result":
                  return (
                    <div
                      key={i}
                      className={`ml-3 rounded-lg border p-2.5 text-[12px] ${
                        t.passed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      <span className="font-bold">
                        {t.passed ? `🛡️ 인용 검증 통과 (${t.verdicts.length}건)` : "🛡️ 검증 실패 → 보고서 수정"}
                      </span>
                      {t.verdicts.some((v) => !v.supported) && (
                        <ul className="mt-1 space-y-0.5 text-[11px]">
                          {t.verdicts.filter((v) => !v.supported).map((v, j) => (
                            <li key={j}>✘ {v.citation}: {v.reason}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                case "tool_use":
                  return (
                    <div key={i} className="ml-3 rounded-lg border border-[#eaecef] bg-[#fbfcfd] p-2.5 text-[12px]">
                      <span className="font-semibold text-[#4b4b4b]">🔧 {TOOL_LABELS[t.name] ?? t.name}</span>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[10px] leading-relaxed text-[#767676]">
                        {JSON.stringify(t.input, null, 1)}
                      </pre>
                    </div>
                  );
                case "tool_result":
                  return (
                    <div key={i} className="ml-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-2.5 text-[12px]">
                      <span className="font-semibold text-emerald-700">✓ {t.summary}</span>
                      {t.name === "search_law" && Array.isArray(t.result) && (
                        <ul className="mt-1.5 space-y-0.5 text-[11px] text-emerald-800">
                          {(t.result as { law: string; article: string; via: string }[]).map((a, j) => (
                            <li key={j}>
                              {a.via === "graph-expansion" ? "└→ " : "• "}
                              {a.article}
                              {a.via === "graph-expansion" && (
                                <span className="text-emerald-500"> (그래프 확장)</span>
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
