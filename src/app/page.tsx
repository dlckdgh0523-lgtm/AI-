import Link from "next/link";
import { Seal, TopBar } from "@/components/brand";

export const metadata = {
  title: "쇼핑 컨시어지 — 상품도, 권리도 지키는 AI 커머스 에이전트",
  description:
    "이창호 · (주)제로 사전과제. 법령 GraphRAG + 멀티 에이전트 + 3중 인용 검증으로 상품 추천과 소비자 권리를 하나의 대화에서.",
};

/**
 * 랜딩 페이지 — 제품을 소개하면서, 무엇을·어떻게·왜 만들었는지의 근거(사전과제
 * 기술 문서)를 함께 담는다. 모든 수치는 저장소의 측정 스크립트로 재현 가능.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <TopBar
        title="쇼핑 컨시어지"
        eyebrow="(주)제로 사전과제 · 이창호"
        links={[
          { href: "/admin", label: "대시보드" },
          { href: "/chat", label: "라이브 데모 →", primary: true },
        ]}
      />

      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-[var(--line)]">
        {/* 배경 워터마크 도장 */}
        <div className="pointer-events-none absolute -right-24 -top-16 hidden opacity-[0.04] lg:block">
          <Seal size={460} uid="ghost" />
        </div>
        <div className="mx-auto max-w-5xl px-6 py-20 sm:px-8 sm:py-28">
          <div className="mb-6 flex justify-center sm:justify-start">
            <Seal size={112} uid="hero" stamp />
          </div>
          <p className="eyebrow mb-4 text-center sm:text-left">법령 GraphRAG 기반 AI 커머스 에이전트</p>
          <h1 className="text-center text-[40px] font-bold leading-[1.1] tracking-[-0.03em] sm:text-left sm:text-[56px]">
            사는 것부터,<br />
            <span className="text-[var(--pine)]">지키는</span> 것까지.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-center text-[15px] leading-relaxed text-[var(--ink-2)] sm:mx-0 sm:text-left sm:text-[16px]">
            필요한 상품을 찾아 비교해 드리고, 소비자 권리는 실제 법 조문을 근거로 안내합니다.
            멀티 에이전트가 판단 과정을 모두 보여주고, 모든 인용은{" "}
            <span className="font-semibold text-[var(--seal-deep)]">3중 검증</span>을 거쳐 도장을 찍습니다.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 sm:justify-start">
            <Link
              href="/chat"
              className="rounded-xl bg-[var(--ink)] px-5 py-3 text-[14px] font-semibold text-[var(--paper)] transition hover:bg-[var(--pine)]"
            >
              라이브 데모 시작 →
            </Link>
            <Link
              href="/admin"
              className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-5 py-3 text-[14px] font-semibold text-[var(--ink-2)] transition hover:border-[var(--ink-3)]"
            >
              인텔리전스 대시보드
            </Link>
          </div>

          {/* 지표 스트립 */}
          <dl className="mt-12 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Metric value="186" label="법령 조문" />
            <Metric value="258" label="참조 엣지" />
            <Metric value="100%" label="복합질의 완전성" accent />
            <Metric value="3중" label="인용 검증" />
          </dl>
        </div>
      </section>

      {/* ── 심사자에게: 제출 노트 ────────────────────────── */}
      <section className="border-b border-[var(--line)] bg-[var(--paper-2)]">
        <div className="mx-auto max-w-3xl px-6 py-14 sm:px-8">
          <p className="eyebrow mb-3">To the reviewer · 제출 노트</p>
          <h2 className="text-[22px] font-bold leading-[1.3] tracking-[-0.02em] sm:text-[25px]">
            (주)제로 심사자님께 — 왜 이렇게 만들었는지
          </h2>
          <div className="mt-5 space-y-4 text-[14px] leading-relaxed text-[var(--ink-2)]">
            <p>
              이 서비스는 <b>(주)제로 사전과제</b> 제출물입니다. 아래 위쪽은 제품처럼 보이지만, 각
              선택에는 &ldquo;사전과제 평가 기준&rdquo;에 맞춘 이유가 있어 그 근거를 함께 적었습니다.
              화면의 모든 데이터는 실시간(네이버·법령 API·Neo4j)이고 <b>mock이 없으며</b>, 모든 수치는
              저장소의 측정 스크립트로 재현됩니다.
            </p>
            <div className="grid gap-2.5">
              {[
                ["① 문제를 어떻게 정의했나", "커머스는 '사는 것'과 '사고 난 뒤 권리'가 분리돼 있습니다. 상품 추천(네이버)과 소비자 권리(법령)를 한 대화에서 풀되, 후자는 환각이 곧 잘못된 법적 조언이 되므로 근거·검증을 핵심에 뒀습니다."],
                ["② 에이전트가 어떻게 판단·행동하나", "단순 API 호출이 아니라 오케스트레이터가 질문을 분해해 전문 에이전트에 위임합니다. 다만 A/B로 측정해보니 단일 도메인엔 멀티가 과했기에, 복잡도 라우팅으로 '단순=단일 직접경로, 복합=멀티 병렬'로 나눴습니다. 모든 판단은 우측 '작업 기록'에 실시간 노출됩니다."],
                ["③ 결과를 서비스 경험으로 어떻게 연결했나", "법령 GraphRAG로 원칙+예외 조문을 함께 회수하고, 인용은 3중 검증을 통과해야 '도장'을 찍습니다. 대화 로그는 대시보드에서 니즈·미충족 수요·핵심 조문으로 환원됩니다. 외국인 쇼퍼를 위한 한/영 전환도 넣었습니다."],
                ["정직함", "GraphRAG는 '썼다'가 아니라 벡터 대비 복합질의 완전성 40%→100%로 측정했고, 멀티 에이전트가 품질 우위를 못 보인 negative result도 숨기지 않고 기록했습니다."],
              ].map(([h, b]) => (
                <div key={h} className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
                  <p className="mb-1 text-[13px] font-bold text-[var(--ink)]">{h}</p>
                  <p className="text-[13px] leading-relaxed text-[var(--ink-3)]">{b}</p>
                </div>
              ))}
            </div>
            <p className="flex items-center justify-end gap-2 pt-1 text-[13px] text-[var(--ink-3)]">
              지원자 <b className="text-[var(--ink)]">이창호</b>
              <span className="inline-flex"><Seal size={30} uid="note" /></span>
            </p>
          </div>
        </div>
      </section>

      {/* ── 두 개의 창구 ─────────────────────────────────── */}
      <Band eyebrow="One conversation, two counters" title="하나의 대화, 두 개의 창구">
        <div className="grid gap-4 sm:grid-cols-2">
          <WorldCard
            hanja="商"
            accent="var(--pine)"
            tint="var(--pine-tint)"
            title="상품 추천 · 비교"
            desc="상황을 말하면 조건에 맞는 상품을 네이버 쇼핑에서 찾아 비교표로 정리합니다. 별점을 지어내지 않고, 후기의 정성적 근거만 인용합니다."
            foot="네이버 쇼핑 · 블로그 검색 (실시간, mock 없음)"
          />
          <WorldCard
            hanja="法"
            accent="var(--seal)"
            tint="var(--seal-tint)"
            title="소비자 권리 · 법령"
            desc="환불·청약철회·교환·광고규제를 실제 조문을 근거로 안내합니다. 원칙 조문 하나가 아니라, 참조로 얽힌 예외·단서 조문까지 함께 회수합니다."
            foot="전자상거래법 · 표시광고법 · 약관규제법 · 소비자기본법"
          />
        </div>
      </Band>

      {/* ── 왜 GraphRAG ──────────────────────────────────── */}
      <Band
        eyebrow="Why GraphRAG · measured, not claimed"
        title="벡터 검색은 조문 하나를 찾고, 그래프는 답 전체를 찾습니다"
        dark
      >
        <p className="max-w-2xl text-[14px] leading-relaxed text-[var(--ledger-ink)]/80">
          단순 벡터 RAG는 질문과 유사한 조문 하나는 잘 찾지만, 완전한 답에 필요한{" "}
          <b className="text-[var(--ledger-ink)]">원칙 + 예외 + 단서</b> 조문 묶음은 놓칩니다. 벡터로
          진입점을 찾고 <code className="rounded bg-white/10 px-1 font-mono text-[0.85em]">REFERS_TO</code>{" "}
          참조를 1홉 순회해 관련 조문을 함께 회수합니다. 자체 평가 하네스(17문항)로 측정한 결과:
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <CompareStat label="단일 조문 검색 recall (12문항)" a="92%" b="92%" note="차이 없음 — 정직하게 기록" />
          <CompareStat label="복합 질의 완전성 (5문항)" a="40%" b="100%" note="가치는 여기서 나온다" highlight />
        </div>
        <p className="mt-6 max-w-2xl rounded-xl border border-[var(--ledger-line)] bg-[var(--ledger-2)] p-4 text-[13px] leading-relaxed text-[var(--ledger-ink)]/75">
          예: <b className="text-[var(--ledger-ink)]">&ldquo;개봉한 노트북 단순변심 환불 돼?&rdquo;</b> →
          벡터는 제17조 제1항(원칙)만 잡지만, 그래프 확장은 제2항 각호(예외)와 단서(확인 개봉 제외),
          &ldquo;표시 없으면 철회 가능&rdquo;(예외의 예외)까지 회수해 3단 논리로 답합니다.
        </p>
      </Band>

      {/* ── 파이프라인 ──────────────────────────────────── */}
      <Band eyebrow="How it works" title="질문 하나가 답이 되기까지">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Step
            n="01"
            title="질문 분해"
            role="오케스트레이터 · Sonnet 5"
            desc="상품·권리가 섞인 질문을 나눠 어떤 전문 에이전트에 맡길지 판단."
          />
          <Step
            n="02"
            title="병렬 위임"
            role="商 / 法 · Haiku 4.5"
            desc="agent-as-tool 로 쇼핑·법령 에이전트에 같은 턴에 병렬 위임."
          />
          <Step
            n="03"
            title="도구 실행"
            role="네이버 API · 법령 그래프"
            desc="상품·후기 검색과 벡터 진입 → 그래프 확장으로 조문 회수."
          />
          <Step
            n="04"
            title="3중 인용 검증"
            role="검증관 · 도장"
            desc="인용 조문을 검색 집합과 대조해 통과한 답에만 도장을 찍음."
            seal
          />
        </ol>
      </Band>

      {/* ── 3중 검증 ────────────────────────────────────── */}
      <Band
        eyebrow="Reliability"
        title="그럴듯하지만 틀린 답을 막는 3중 검증"
        sub="AI가 없는 조문을 지어내는 순간 소비자에게는 잘못된 법적 조언이 됩니다. 그래서 인용은 통과해야 도장이 찍힙니다."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <VerifyCard
            n="①"
            title="결정론적 대조"
            desc="보고서가 인용한 조문이 이번 조사에서 실제 그래프에서 검색됐는지 코드로 확인 — 환각 인용을 기계적으로 탈락."
          />
          <VerifyCard
            n="②"
            title="LLM 크리틱"
            desc="&lsquo;이 인용을 반박하라&rsquo;는 검증관이 조문 원문과 대조. 실패 시 1회 자동 수정, 검증이 죽어도 원본 폴백."
          />
          <VerifyCard
            n="③"
            title="최종 답변 검증"
            desc="합성 중 조문이 바뀌는 경우까지, 최종 답변의 모든 인용을 다시 대조하고 미확인 인용은 각주로 정직하게 고지."
          />
        </div>
      </Band>

      {/* ── 기술 하이라이트 ─────────────────────────────── */}
      <Band eyebrow="Under the hood" title="설계 근거">
        <div className="grid gap-4 sm:grid-cols-2">
          <TechCard title="임베딩 · 벡터 검색">
            Voyage <code>voyage-3.5</code>(1024d), 한국어 포함 다국어 retrieval 특화.{" "}
            <code>document</code>/<code>query</code> 입력 타입을 분리해 비대칭 검색 품질 확보. Neo4j 벡터
            인덱스 하나에서 <b>벡터 진입 → 그래프 확장</b>이 완결 — 이중 DB 동기화 비용 제거.
          </TechCard>
          <TechCard title="의미 캐시 · 키 설계">
            질문 임베딩이 캐시와 코사인 <b>0.88 이상</b>이면 법률 루프 전체를 건너뜀. 임계값은
            패러프레이즈(0.90~0.92) vs 타 쟁점(0.65~0.78) 사이 마진으로 <b>측정해</b> 결정. 캐시 키는
            LLM 검색어가 아닌 <b>사용자 원 질문</b>, TTL 7일 + ingest 시 전체 무효화.
          </TechCard>
          <TechCard title="비용 · 모델 배치">
            합성은 Sonnet 5, 조사 서브에이전트는 Haiku 4.5 — 복합 질문 1건 <b>$0.45 → $0.09(80%↓)</b>.
            프롬프트 캐싱으로 반복 루프 입력 비용 <b>~90%↓</b>. <code>npm run bench</code>로 재현.
          </TechCard>
          <TechCard title="서비스 보안">
            IP당 분당 6·일 100회 레이트리밋(Denial of Wallet), zod 요청 스키마(4,000자·24턴), 로그
            읽기 서버 라우트 이전 + Supabase RLS, 프롬프트 인젝션 레드팀, 저장 전 PII 마스킹.
          </TechCard>
        </div>

        {/* 모델 배치 표 */}
        <div className="mt-8">
          <h3 className="mb-3 text-[13px] font-bold text-[var(--ink-2)]">역할별 모델 배치</h3>
          <DocTable
            head={["역할", "모델", "왜"]}
            rows={[
              ["오케스트레이터 (분해·합성)", "Claude Sonnet 5", "합성·표 작성엔 충분 — Opus 대비 40%+ 절감, 품질 유지"],
              ["쇼핑/법률 서브에이전트 (조사)", "Claude Haiku 4.5", "도구 호출·요약 위주 — 복합 질문 1건 80% 절감"],
              ["인용 검증관 / 후속질문", "Sonnet 5 (저 effort) / Haiku 4.5", "원문 주어진 판별 과제라 최고 성능 모델 불필요"],
            ]}
          />
        </div>
      </Band>

      {/* ── 한계 ────────────────────────────────────────── */}
      <Band eyebrow="Honest by design" title="알고 있는 한계">
        <ul className="grid gap-2.5 text-[13.5px] leading-relaxed text-[var(--ink-2)] sm:grid-cols-2">
          {[
            "참조 파싱이 '제N조' 정규식 기반 — 타법 참조·준용 방향성 세분화는 다음 단계.",
            "평가셋 17문항·저자 작성 gold — 분쟁조정 사례 확장과 LLM 저지 도입 여지.",
            "레이트리밋 인메모리 — 프로덕션은 서버리스 인스턴스 공유 저장소 필요.",
            "법률 자문이 아닌 일반 정보 안내이며, 답변에 해당 고지를 포함.",
          ].map((t) => (
            <li key={t} className="flex gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--card)] p-3.5">
              <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rotate-45 rounded-[1px] bg-[var(--seal)]" />
              {t}
            </li>
          ))}
        </ul>
      </Band>

      {/* ── 최종 CTA ────────────────────────────────────── */}
      <section className="border-t border-[var(--line)] bg-[var(--paper-2)]">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center sm:px-8">
          <div className="mb-5 flex justify-center">
            <Seal size={72} uid="cta" />
          </div>
          <h2 className="text-[26px] font-bold tracking-[-0.02em] sm:text-[32px]">
            지금 대화로 확인해 보세요
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[14px] text-[var(--ink-3)]">
            상품을 찾아주고, 소비자 권리를 법 조문 근거로 — 판단 과정과 검증 도장까지 실시간으로.
          </p>
          <Link
            href="/chat"
            className="mt-7 inline-block rounded-xl bg-[var(--ink)] px-6 py-3 text-[14px] font-semibold text-[var(--paper)] transition hover:bg-[var(--pine)]"
          >
            라이브 데모 시작 →
          </Link>
        </div>
      </section>

      <footer className="border-t border-[var(--line)] py-6 text-center text-[12px] text-[var(--ink-3)]">
        (주)제로 사전과제 · 이창호 —{" "}
        <Link href="/chat" className="text-[var(--pine)] hover:underline">라이브 데모</Link>
        {" · "}
        <Link href="/admin" className="text-[var(--pine)] hover:underline">대시보드</Link>
        {" · "}수치는 <code className="font-mono">npm run eval / bench / redteam</code> 로 재현 가능
      </footer>
    </div>
  );
}

/* ── 로컬 프리젠테이션 헬퍼 ─────────────────────────────── */

function Metric({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div>
      <div className={`figure text-[30px] font-semibold leading-none ${accent ? "text-[var(--seal)]" : "text-[var(--ink)]"}`}>
        {value}
      </div>
      <div className="eyebrow mt-1.5">{label}</div>
    </div>
  );
}

function Band({
  eyebrow,
  title,
  sub,
  dark,
  children,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  dark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={dark ? "ledger border-b border-[var(--ledger-line)]" : "border-b border-[var(--line)]"}>
      <div className="mx-auto max-w-5xl px-6 py-16 sm:px-8 sm:py-20">
        <p className={`eyebrow mb-3 ${dark ? "!text-[var(--ledger-ink-2)]" : ""}`}>{eyebrow}</p>
        <h2
          className={`max-w-3xl text-[24px] font-bold leading-[1.25] tracking-[-0.02em] sm:text-[28px] ${
            dark ? "text-[var(--ledger-ink)]" : "text-[var(--ink)]"
          }`}
        >
          {title}
        </h2>
        {sub && <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[var(--ink-3)]">{sub}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function WorldCard({
  hanja,
  accent,
  tint,
  title,
  desc,
  foot,
}: {
  hanja: string;
  accent: string;
  tint: string;
  title: string;
  desc: string;
  foot: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_1px_2px_rgba(33,29,24,0.04)]">
      <div className="h-[3px] w-full" style={{ background: accent }} />
      <div className="p-6">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg font-serif text-[18px] font-semibold text-white"
          style={{ background: accent }}
        >
          {hanja}
        </span>
        <h3 className="mt-4 text-[17px] font-bold">{title}</h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink-2)]">{desc}</p>
        <p className="mt-4 border-t border-[var(--line)] pt-3 text-[11.5px]" style={{ color: accent }}>
          {foot}
        </p>
      </div>
    </div>
  );
}

function CompareStat({
  label,
  a,
  b,
  note,
  highlight,
}: {
  label: string;
  a: string;
  b: string;
  note: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        highlight ? "border-[#7cc4a0]/40 bg-[#7cc4a0]/[0.08]" : "border-[var(--ledger-line)] bg-[var(--ledger-2)]"
      }`}
    >
      <p className="text-[12.5px] text-[var(--ledger-ink)]/70">{label}</p>
      <div className="mt-3 flex items-end gap-3">
        <div>
          <div className="figure text-[22px] font-semibold text-[var(--ledger-ink-2)]">{a}</div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--ledger-ink-2)]">벡터 단독</div>
        </div>
        <div className="mb-2 text-[var(--ledger-ink-2)]">→</div>
        <div>
          <div className={`figure text-[34px] font-semibold leading-none ${highlight ? "text-[#7cc4a0]" : "text-[var(--ledger-ink)]"}`}>
            {b}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--ledger-ink-2)]">GraphRAG</div>
        </div>
      </div>
      <p className="mt-3 text-[11.5px] text-[var(--ledger-ink)]/60">{note}</p>
    </div>
  );
}

function Step({
  n,
  title,
  role,
  desc,
  seal,
}: {
  n: string;
  title: string;
  role: string;
  desc: string;
  seal?: boolean;
}) {
  return (
    <li className="relative rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
      <div className="flex items-center justify-between">
        <span className="figure text-[15px] font-semibold text-[var(--ink-3)]">{n}</span>
        {seal ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--seal)] font-serif text-[11px] text-[var(--seal)]">
            確
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 text-[15px] font-bold">{title}</h3>
      <p className="mt-1 font-mono text-[10.5px] uppercase tracking-wider text-[var(--pine)]">{role}</p>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--ink-2)]">{desc}</p>
    </li>
  );
}

function VerifyCard({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5">
      <span className="figure text-[22px] font-semibold text-[var(--seal)]">{n}</span>
      <h3 className="mt-2 text-[15px] font-bold">{title}</h3>
      <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--ink-2)]">{desc}</p>
    </div>
  );
}

function TechCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 [&_code]:rounded [&_code]:bg-[var(--paper-2)] [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.82em]">
      <h3 className="text-[15px] font-bold">{title}</h3>
      <p className="mt-2.5 text-[13px] leading-relaxed text-[var(--ink-2)]">{children}</p>
    </div>
  );
}

function DocTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="border-b border-[var(--line)] bg-[var(--paper)] px-3.5 py-2.5 text-left text-[12px] font-bold text-[var(--ink-2)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 ? "bg-[#faf9f5]" : "bg-[var(--card)]"}>
              {r.map((c, j) => (
                <td
                  key={j}
                  className={`border-b border-[var(--line-soft)] px-3.5 py-2.5 align-top text-[var(--ink-2)] ${
                    j === 0 ? "font-semibold text-[var(--ink)]" : ""
                  }`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
