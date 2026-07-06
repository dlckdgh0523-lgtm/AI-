"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Seal } from "@/components/brand";
import { UI, type Lang } from "@/lib/i18n";

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
  | { kind: "route"; route: string; label: string }
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

// 오른쪽 장부(worklog)는 어두운 재질 — 밝은 accent 사용
const AGENT_META: Record<string, { icon: string; accent: string; line: string; bg: string }> = {
  shopping: { icon: "商", accent: "#7cc4a0", line: "rgba(124,196,160,0.34)", bg: "rgba(124,196,160,0.10)" },
  law: { icon: "法", accent: "#e5806f", line: "rgba(229,128,111,0.34)", bg: "rgba(229,128,111,0.10)" },
};

const GROUP_STYLE = [
  { accent: "var(--pine)", tint: "var(--pine-tint)" },
  { accent: "var(--seal)", tint: "var(--seal-tint)" },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [traces, setTraces] = useState<TraceEvent[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showTrace, setShowTrace] = useState(true); // 판단 과정을 기본으로 옆에 표시
  const [lang, setLang] = useState<Lang>("ko"); // UI + AI 답변 언어 (외국인 쇼퍼 대응)
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const t = UI[lang];

  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "ko") setLang(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem("lang", lang);
  }, [lang]);

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

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, lang }),
      });
      if (!res.ok || !res.body) throw new Error(`request failed: ${res.status}`);

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
          content: `${t.errorPrefix}${e instanceof Error ? e.message : e}`,
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
      case "route":
        setTraces((prev) => [...prev, { kind: "route", route: event.route as string, label: event.label as string }]);
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
    <div className="flex h-screen bg-[var(--paper)] text-[var(--ink)]">
      <div className="flex flex-1 flex-col">
        {/* 상단 간판 */}
        <header className="z-10 flex items-center justify-between border-b border-[var(--line)] bg-[var(--paper)]/85 px-5 py-2.5 backdrop-blur">
          <div className="flex items-center gap-3">
            <Seal size={38} uid="brand" />
            <div className="leading-tight">
              <div className="flex items-center gap-1.5 text-[15px] font-bold tracking-[-0.02em]">
                쇼핑 컨시어지
                <span className="rounded bg-[var(--seal-tint)] px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wider text-[var(--seal-deep)]">
                  BETA
                </span>
              </div>
              <p className="eyebrow mt-0.5">Commerce × 소비자권리 · Verified</p>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {/* 한/영 전환 — UI와 AI 답변 언어를 함께 전환 */}
            <div className="mr-1 flex items-center rounded-lg border border-[var(--line)] p-0.5 text-[12px] font-semibold">
              {(["ko", "en"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={`rounded-md px-2 py-1 transition ${
                    lang === l ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-3)] hover:text-[var(--ink)]"
                  }`}
                >
                  {l === "ko" ? "한국어" : "EN"}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowTrace((v) => !v)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                showTrace
                  ? "bg-[var(--ink)] text-[var(--paper)]"
                  : "text-[var(--ink-2)] hover:bg-[var(--paper-2)]"
              }`}
            >
              {t.worklog}{showTrace ? " ·" : ""}
            </button>
            <a
              href="/admin"
              className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--ink-2)] transition hover:bg-[var(--paper-2)]"
            >
              {t.dashboard}
            </a>
            <a
              href="/"
              className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--ink-2)] transition hover:bg-[var(--paper-2)]"
            >
              {t.about}
            </a>
          </nav>
        </header>

        {/* 본문 */}
        <main className="flex-1 overflow-y-auto">
          {empty ? (
            <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-5 py-10">
              <div className="mb-9 text-center">
                <div className="mb-5 flex justify-center">
                  <Seal size={104} uid="hero" stamp />
                </div>
                <p className="eyebrow mb-3">{t.eyebrow}</p>
                <h1 className="text-[30px] font-bold leading-[1.15] tracking-[-0.03em] text-[var(--ink)]">
                  {t.heroLine1}<br />{t.heroLine2}
                </h1>
                <p className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed text-[var(--ink-3)]">
                  {t.heroDesc}
                </p>
              </div>
              <div className="grid gap-3.5 sm:grid-cols-2">
                {t.groups.map((g, gi) => (
                  <div
                    key={g.label}
                    className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_1px_2px_rgba(33,29,24,0.04)]"
                  >
                    <div className="h-[3px] w-full" style={{ background: GROUP_STYLE[gi].accent }} />
                    <div className="p-4">
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-md font-serif text-[13px] font-semibold text-white"
                          style={{ background: GROUP_STYLE[gi].accent }}
                        >
                          {g.hanja}
                        </span>
                        <span className="text-[14px] font-bold">{g.label}</span>
                      </div>
                      <p className="mb-3 pl-8 text-[11.5px] leading-snug text-[var(--ink-3)]">{g.desc}</p>
                      <div className="space-y-2">
                        {g.items.map((ex) => (
                          <button
                            key={ex}
                            onClick={() => send(ex)}
                            className="group flex w-full items-start gap-2 rounded-xl bg-[var(--paper)] px-3 py-2.5 text-left text-[13px] leading-snug text-[var(--ink-2)] transition hover:bg-[var(--paper-2)]"
                          >
                            <span
                              className="mt-[6px] h-[5px] w-[5px] shrink-0 rotate-45 rounded-[1px] opacity-70 transition group-hover:opacity-100"
                              style={{ background: GROUP_STYLE[gi].accent }}
                            />
                            {ex}
                          </button>
                        ))}
                      </div>
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
                    <div className="max-w-[82%] rounded-2xl rounded-tr-sm bg-[var(--ink)] px-4 py-2.5 text-[14px] leading-relaxed text-[var(--paper)] shadow-sm">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex gap-2.5">
                    <div
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--pine)] font-serif text-[14px] text-white"
                      title="컨시어지"
                    >
                      詢
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="rounded-2xl rounded-tl-sm border border-[var(--line)] bg-[var(--card)] px-4 py-3 shadow-[0_1px_2px_rgba(33,29,24,0.04)]">
                        {m.content ? (
                          <div className="markdown-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 py-1">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="ml-2 text-[13px] text-[var(--ink-3)]">
                              {t.thinking}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 상품 카드 (마지막 어시스턴트 메시지 아래) */}
                      {i === messages.length - 1 && products.length > 0 && (
                        <div className="fade-in mt-3">
                          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ink-3)]">
                            <span className="h-[6px] w-[6px] rotate-45 rounded-[1px] bg-[var(--pine)]" />
                            {t.naverResults} <span className="figure text-[var(--ink-2)]">{products.length}</span>{t.unit}
                          </p>
                          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                            {products.slice(0, 9).map((p) => (
                              <a
                                key={p.link}
                                href={p.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--card)] transition hover:border-[var(--pine)] hover:shadow-md"
                              >
                                <div className="aspect-square overflow-hidden bg-[var(--paper)]">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={p.image}
                                    alt={p.title}
                                    loading="lazy"
                                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                                  />
                                </div>
                                <div className="p-2.5">
                                  <p className="line-clamp-2 min-h-[2.4em] text-[12px] leading-snug text-[var(--ink-2)]">
                                    {p.title}
                                  </p>
                                  <p className="mt-1.5 text-[var(--ink)]">
                                    <span className="figure text-[16px] font-semibold">
                                      {p.price.toLocaleString()}
                                    </span>
                                    <span className="text-[12px] text-[var(--ink-3)]"> 원</span>
                                  </p>
                                  <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--pine)]">{p.mall}</p>
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 후속 액션 */}
                      {i === messages.length - 1 && suggestions.length > 0 && !streaming && (
                        <div className="fade-in mt-3">
                          <p className="eyebrow mb-2">{t.followupTitle}</p>
                          <div className="flex flex-wrap gap-2">
                            {suggestions.map((s) => (
                              <button
                                key={s}
                                onClick={() => send(s)}
                                className="rounded-full border border-[var(--line)] bg-[var(--card)] px-3.5 py-1.5 text-[13px] text-[var(--ink-2)] transition hover:border-[var(--pine)] hover:bg-[var(--pine-tint)] hover:text-[var(--pine)]"
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
        <div className="border-t border-[var(--line)] bg-[var(--paper)] px-4 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="mx-auto flex max-w-2xl items-end gap-2"
          >
            <div className="flex flex-1 items-end rounded-2xl border border-[var(--line)] bg-[var(--card)] px-4 py-2 transition focus-within:border-[var(--pine)] focus-within:shadow-[0_0_0_3px_var(--pine-tint)]">
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
                placeholder={t.placeholder}
                className="max-h-[120px] flex-1 resize-none bg-transparent py-1 text-[14px] outline-none placeholder:text-[var(--ink-3)]"
                disabled={streaming}
              />
            </div>
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--ink)] text-[var(--paper)] transition hover:bg-[var(--pine)] disabled:bg-[var(--line)] disabled:text-[var(--ink-3)]"
              aria-label="전송"
            >
              {streaming ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                  <path d="M3.4 20.4L21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8z" fill="currentColor" />
                </svg>
              )}
            </button>
          </form>
          <p className="mx-auto mt-1.5 max-w-2xl text-center text-[11px] text-[var(--ink-3)]">
            {t.disclaimer}
          </p>
        </div>
      </div>

      {/* 장부(worklog) — 컨시어지의 뒷창구 */}
      {showTrace && (
        <aside className="ledger hidden w-[340px] shrink-0 flex-col border-l border-[var(--ledger-line)] lg:flex">
          <div className="flex items-center justify-between border-b border-[var(--ledger-line)] px-4 py-3">
            <div>
              <h2 className="text-[13px] font-bold text-[var(--ledger-ink)]">작업 기록</h2>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ledger-ink-2)]">
                Worklog · 판단 · 도구 · 검증
              </p>
            </div>
            <button
              onClick={() => setShowTrace(false)}
              className="text-[var(--ledger-ink-2)] transition hover:text-[var(--ledger-ink)]"
              aria-label="작업 기록 닫기"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {traces.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <div className="select-none font-serif text-[130px] leading-none text-[var(--ledger-ink)]/[0.055]">
                  帳
                </div>
                <p className="ledger-entry mt-3 max-w-[240px] leading-relaxed text-[var(--ledger-ink-2)]">
                  질문을 보내면 오케스트레이터의 판단 · 에이전트 위임 · 도구 호출 · 법령 그래프
                  탐색 · 인용 검증이 순서대로 이곳에 기록됩니다.
                </p>
              </div>
            )}
            {traces.map((t, i) => {
              const meta = "agent" in t && t.agent ? AGENT_META[t.agent] : undefined;
              switch (t.kind) {
                case "route":
                  return (
                    <div
                      key={i}
                      className="rounded-lg border border-[var(--ledger-line)] bg-[var(--ledger-2)] p-2.5"
                    >
                      <span className="mb-0.5 block font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ledger-ink-2)]">
                        Route · 복잡도 라우팅
                      </span>
                      <p className="text-[12px] font-semibold text-[var(--ledger-ink)]">{t.label}</p>
                    </div>
                  );
                case "iteration":
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-1 pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ledger-ink-2)]"
                    >
                      <span className="h-px flex-1 bg-[var(--ledger-line)]" />
                      Orchestrator · <span className="figure">{t.n}</span>회차
                      <span className="h-px flex-1 bg-[var(--ledger-line)]" />
                    </div>
                  );
                case "thinking":
                  return (
                    <div key={i} className="rounded-lg bg-[var(--ledger-2)] p-2.5">
                      <span className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--ledger-ink-2)]">
                        判斷 · 판단
                      </span>
                      <p className="text-[12px] leading-relaxed text-[var(--ledger-ink)]/85">{t.text}</p>
                    </div>
                  );
                case "agent_start":
                  return (
                    <div
                      key={i}
                      className="rounded-lg border p-2.5"
                      style={{ borderColor: meta?.line, background: meta?.bg }}
                    >
                      <div className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: meta?.accent }}>
                        <span className="font-serif">{meta?.icon}</span> {t.label} 시작
                      </div>
                      <p className="ledger-entry mt-1 line-clamp-3 text-[var(--ledger-ink-2)]">위임: {t.task}</p>
                    </div>
                  );
                case "agent_done":
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-semibold"
                      style={{ borderColor: meta?.line, background: meta?.bg, color: meta?.accent }}
                    >
                      <span className="font-serif">{meta?.icon}</span> {t.label} 완료
                      {t.usage ? (
                        <span className="ml-auto font-mono text-[10px] font-normal text-[var(--ledger-ink-2)]">
                          <span className="figure">{t.usage.input_tokens}</span>/
                          <span className="figure">{t.usage.output_tokens}</span> tok
                        </span>
                      ) : null}
                    </div>
                  );
                case "verify_start":
                  return (
                    <div key={i} className="ml-3 rounded-lg border border-[#8a6d2f]/40 bg-[#8a6d2f]/15 p-2 text-[11px] text-[#e0be7a]">
                      🛡 인용 검증 중…
                    </div>
                  );
                case "verify_result":
                  return t.passed ? (
                    <div
                      key={i}
                      className="ml-3 flex items-center gap-3 rounded-lg border border-[var(--ledger-line)] bg-[var(--ledger-2)] p-2.5"
                    >
                      <Seal size={46} uid={`v${i}`} stamp />
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold text-[var(--ledger-ink)]">인용 근거 검증 통과</p>
                        <p className="font-mono text-[10.5px] text-[var(--ledger-ink-2)]">
                          <span className="figure">{t.verdicts.length}</span>건 조문 대조 · 確認
                          {t.revised ? " · 수정 반영" : ""}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="ml-3 rounded-lg border border-[#8a6d2f]/40 bg-[#8a6d2f]/15 p-2.5 text-[12px] text-[#e0be7a]">
                      <span className="font-bold">🛡 검증 실패 → 보고서 수정</span>
                      {t.verdicts.some((v) => !v.supported) && (
                        <ul className="ledger-entry mt-1 space-y-0.5">
                          {t.verdicts.filter((v) => !v.supported).map((v, j) => (
                            <li key={j}>✘ {v.citation}: {v.reason}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                case "tool_use":
                  return (
                    <div key={i} className="ml-3 rounded-lg border border-[var(--ledger-line)] bg-[var(--ledger-2)] p-2.5">
                      <span className="font-mono text-[11px] font-semibold text-[var(--ledger-ink)]">
                        › {TOOL_LABELS[t.name] ?? t.name}
                      </span>
                      <pre className="ledger-entry mt-1 overflow-x-auto whitespace-pre-wrap text-[10px] text-[var(--ledger-ink-2)]">
                        {JSON.stringify(t.input, null, 1)}
                      </pre>
                    </div>
                  );
                case "tool_result":
                  return (
                    <div key={i} className="ml-3 rounded-lg border border-[#7cc4a0]/25 bg-[#7cc4a0]/[0.08] p-2.5">
                      <span className="text-[12px] font-semibold text-[#7cc4a0]">✓ {t.summary}</span>
                      {t.name === "search_law" && Array.isArray(t.result) && (
                        <ul className="ledger-entry mt-1.5 space-y-0.5 text-[var(--ledger-ink)]/80">
                          {(t.result as { law: string; article: string; via: string }[]).map((a, j) => (
                            <li key={j}>
                              {a.via === "graph-expansion" ? "└→ " : "• "}
                              {a.article}
                              {a.via === "graph-expansion" && (
                                <span className="text-[#7cc4a0]"> (그래프 확장)</span>
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
