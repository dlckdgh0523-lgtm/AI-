/** 채팅 UI 문자열 한/영 사전 (외국인 쇼퍼 대응). AI 답변 언어는 /api/chat의 lang 파라미터로 별도 제어. */
export type Lang = "ko" | "en";

export const UI = {
  ko: {
    eyebrow: "AI 커머스 에이전트 · GraphRAG",
    heroLine1: "사는 것부터,",
    heroLine2: "지키는 것까지.",
    heroDesc:
      "필요한 상품을 찾아 비교해 드리고, 소비자 권리는 실제 법 조문을 근거로 안내합니다. 모든 답변의 인용은 검증을 거칩니다.",
    worklog: "작업 기록",
    dashboard: "대시보드",
    about: "소개",
    thinking: "컨시어지가 근거를 찾고 있어요",
    status: {
      analyzing: "질문을 분석하고 있어요…",
      shopping: "상품을 검색하고 있어요…",
      reviews: "실사용 후기를 확인하고 있어요…",
      law: "관련 법 조문을 찾고 있어요…",
      shoppingAgent: "상품 전문가가 조사하고 있어요…",
      lawAgent: "법령 전문가가 조사하고 있어요…",
      verify: "인용 근거를 검증하고 있어요…",
      writing: "답변을 정리하고 있어요…",
    } as Record<string, string>,
    naverResults: "네이버 쇼핑 검색 결과",
    unit: "개",
    followupTitle: "이어서 물어보기",
    placeholder: "예: 자취 시작하는데 20만원 이하 로봇청소기 추천해줘",
    disclaimer: "상품 정보·법령은 실시간 검색 결과 기반입니다. 법령 안내는 일반 정보이며 법률 자문이 아닙니다.",
    errorPrefix: "⚠️ 오류가 발생했습니다: ",
    groups: [
      {
        hanja: "商",
        label: "상품 추천 · 비교",
        desc: "상황을 말하면 조건에 맞는 상품을 찾아 비교해 드려요.",
        items: [
          "장마철 원룸에서 쓸 제습기 10만원 이하로 추천해줘",
          "캠핑용 버너 2개만 비교해서 추천해줘",
        ],
      },
      {
        hanja: "法",
        label: "소비자 권리 · 법령",
        desc: "환불·교환·광고 규제를 실제 법 조문 근거로 안내해요.",
        items: [
          "온라인에서 산 노트북 개봉했는데 환불 가능해?",
          "'전국 최저가 보장'이라고 광고 문구 써도 돼?",
        ],
      },
    ],
  },
  en: {
    eyebrow: "AI Commerce Agent · GraphRAG",
    heroLine1: "From buying,",
    heroLine2: "to protecting.",
    heroDesc:
      "Finds and compares the products you need, and explains your consumer rights grounded in actual Korean law. Every citation is verified.",
    worklog: "Worklog",
    dashboard: "Dashboard",
    about: "About",
    thinking: "The concierge is finding the evidence…",
    status: {
      analyzing: "Analyzing your question…",
      shopping: "Searching products…",
      reviews: "Checking real user reviews…",
      law: "Finding the relevant law articles…",
      shoppingAgent: "Product specialist is researching…",
      lawAgent: "Legal specialist is researching…",
      verify: "Verifying the citations…",
      writing: "Composing the answer…",
    } as Record<string, string>,
    naverResults: "Naver Shopping results",
    unit: "items",
    followupTitle: "Ask a follow-up",
    placeholder: "e.g. Recommend a robot vacuum under ₩200,000 for a studio",
    disclaimer:
      "Product and legal info are based on live search. Legal guidance is general information, not legal advice.",
    errorPrefix: "⚠️ Something went wrong: ",
    groups: [
      {
        hanja: "商",
        label: "Product recommend · compare",
        desc: "Tell us your situation and we'll find and compare matching products.",
        items: [
          "Recommend a dehumidifier under ₩100,000 for a humid studio",
          "Compare 2 camping stoves and recommend one",
        ],
      },
      {
        hanja: "法",
        label: "Consumer rights · law",
        desc: "Refunds, exchanges, ad rules — explained with actual law articles.",
        items: [
          "I opened the laptop I bought online — can I still get a refund?",
          "Can I advertise 'guaranteed lowest price nationwide'?",
        ],
      },
    ],
  },
} as const;
