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
        {/* Pretendard — 한국 웹서비스 표준 폰트 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
