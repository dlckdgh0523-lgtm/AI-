import Link from "next/link";

/* ── 인주(印朱) 검증 도장 — 세 페이지 공유 시그니처 ─────────
   상품(商)·권리(法) 두 세계를 한 창구에서 다루고, 근거를 검증해
   도장 찍는 '검증하는 컨시어지' 아이덴티티의 단일 소스. */
export function Seal({ size = 96, uid = "s", stamp = false }: { size?: number; uid?: string; stamp?: boolean }) {
  const pid = `sealArc-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`seal-mark ${stamp ? "seal-stamp" : ""}`}
      role="img"
      aria-label="근거 검증 도장"
    >
      <defs>
        <path id={pid} d="M50,50 m -37,0 a 37,37 0 1,1 74,0 a 37,37 0 1,1 -74,0" />
      </defs>
      <circle className="seal-ring" cx="50" cy="50" r="47" strokeWidth="2.4" />
      <circle className="seal-ring" cx="50" cy="50" r="41.5" strokeWidth="0.9" />
      <text className="seal-arc" fontSize="7">
        <textPath href={`#${pid}`} startOffset="1%">
          근거 검증 · 確認 · CITATION VERIFIED ·{" "}
        </textPath>
      </text>
      <text
        className="seal-hanja"
        x="50"
        y="51"
        fontSize="29"
        textAnchor="middle"
        dominantBaseline="central"
        letterSpacing="1"
      >
        確認
      </text>
    </svg>
  );
}

/* ── 공유 상단바 — /about · /admin 일관성 ──────────────────── */
export function TopBar({
  title,
  eyebrow,
  links,
}: {
  title: string;
  eyebrow?: string;
  links: { href: string; label: string; primary?: boolean }[];
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--paper)]/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-2.5 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <Seal size={38} uid="topbar" />
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-[-0.02em] text-[var(--ink)]">{title}</div>
            {eyebrow && <p className="eyebrow mt-0.5">{eyebrow}</p>}
          </div>
        </Link>
        <nav className="flex items-center gap-1.5 text-[13px] font-medium">
          {links.map((l) =>
            l.primary ? (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg bg-[var(--ink)] px-3.5 py-1.5 text-[var(--paper)] transition hover:bg-[var(--pine)]"
              >
                {l.label}
              </Link>
            ) : (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-1.5 text-[var(--ink-2)] transition hover:bg-[var(--paper-2)]"
              >
                {l.label}
              </Link>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
