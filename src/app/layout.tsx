import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "쇼핑 컨시어지 — AI 커머스 에이전트",
  description:
    "상황 기반 상품 추천·비교와 소비자 권리(법령) 안내를 하나의 대화로. GraphRAG 기반 AI 커머스 에이전트.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        {/* Pretendard — 한글 본문·UI */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
        {/* Fraunces(숫자·조문번호·워드마크) + IBM Plex Mono(장부/워크로그) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
