import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { searchShopping, searchBlog } from "./naver";
import { searchLawGraph } from "./graphrag";

/**
 * 도구 입력 zod 스키마 — LLM이 생성한 도구 인자를 실행 전 런타임 검증.
 * 잘못된 입력(빈 질의, 음수 예산, 잘못된 enum 등)이 외부 API·DB로 넘어가 터지는 것을 막는다.
 */
const ProductInput = z.object({
  query: z.string().min(1, "검색어가 비어 있습니다"),
  min_price: z.number().positive().optional(),
  max_price: z.number().positive().optional(),
  sort: z.enum(["sim", "asc", "dsc"]).optional(),
});
const ReviewInput = z.object({
  query: z.string().min(1, "검색어가 비어 있습니다"),
});
const LawInput = z.object({
  question: z.string().min(1, "질문이 비어 있습니다"),
});

/** zod 검증 실패 시 사람이 읽을 수 있는 메시지로 변환 */
function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`도구 입력 검증 실패 — ${msg}`);
  }
  return r.data;
}

/** 에이전트가 사용하는 도구 정의 (Claude tool use) */
export const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_products",
    description:
      "네이버 쇼핑에서 상품을 검색한다. 사용자가 상품 추천/탐색/비교를 원할 때 호출. " +
      "검색어는 사용자의 상황을 구체적인 상품 키워드로 변환해서 넣을 것 (예: '장마철 원룸 제습' → '미니 제습기').",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "상품 검색 키워드" },
        min_price: {
          type: "number",
          description: "최소 가격 (원). 사용자가 하한을 말했을 때만 지정",
        },
        max_price: {
          type: "number",
          description: "최대 예산 (원). 사용자가 예산을 말했을 때만 지정",
        },
        sort: {
          type: "string",
          enum: ["sim", "asc", "dsc"],
          description: "정렬: sim=정확도, asc=가격낮은순, dsc=가격높은순",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_reviews",
    description:
      "네이버 블로그에서 상품 실사용 후기를 검색한다. 특정 상품/브랜드의 장단점, 실사용 경험이 필요할 때 호출.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "후기 검색어 (예: '샤오미 제습기 후기')" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_law",
    description:
      "커머스 소비자보호 법령 지식그래프(GraphRAG)를 검색한다. 환불, 청약철회, 교환, 광고 표현 규제, " +
      "약관, 소비자 분쟁 등 법적 근거가 필요한 질문에 반드시 호출. 벡터 검색으로 관련 조문을 찾고 " +
      "참조 관계를 따라 예외·준용 조문까지 함께 반환하므로, 반환된 조문 전체를 검토한 뒤 답할 것.",
    input_schema: {
      type: "object" as const,
      properties: {
        question: {
          type: "string",
          description: "법적 쟁점을 담은 자연어 질문 (예: '온라인 구매 상품 개봉 후 환불 가능 여부')",
        },
      },
      required: ["question"],
    },
  },
];

export interface ToolExecution {
  summary: string; // 트레이스 UI 표시용 요약
  result: unknown; // 모델에 전달할 전체 결과
}

/** 도구 실행 디스패처 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<ToolExecution> {
  switch (name) {
    case "search_products": {
      const args = validate(ProductInput, input);
      const { min_price: minPrice, max_price: maxPrice } = args;
      const hasPriceFilter = Boolean(minPrice || maxPrice);
      // 가격 필터가 있으면: 관련도순으로 넓게(100개) 가져와 가격 범위로 필터한 뒤,
      // 요청된 정렬을 클라이언트에서 적용. (서버 asc/dsc 정렬 + 범위 조합의 빈 결과 방지)
      const items = await searchShopping(args.query, {
        display: hasPriceFilter ? 100 : 20,
        sort: hasPriceFilter ? "sim" : (args.sort ?? "sim"),
      });
      const filtered = items.filter((i) => {
        const price = Number(i.lprice);
        if (minPrice && price < minPrice) return false;
        if (maxPrice && price > maxPrice) return false;
        return true;
      });
      // 가격 필터 상황에서 요청 정렬을 클라이언트에서 적용
      if (hasPriceFilter && args.sort === "asc") filtered.sort((a, b) => Number(a.lprice) - Number(b.lprice));
      if (hasPriceFilter && args.sort === "dsc") filtered.sort((a, b) => Number(b.lprice) - Number(a.lprice));
      const priceLabel =
        minPrice && maxPrice
          ? ` (${minPrice.toLocaleString()}~${maxPrice.toLocaleString()}원)`
          : maxPrice
            ? ` (${maxPrice.toLocaleString()}원 이하)`
            : minPrice
              ? ` (${minPrice.toLocaleString()}원 이상)`
              : "";
      const result = filtered.slice(0, 8).map((i) => ({
        title: i.title,
        price: Number(i.lprice),
        mall: i.mallName,
        brand: i.brand,
        category: [i.category1, i.category2, i.category3].filter(Boolean).join(">"),
        link: i.link,
        image: i.image,
        productId: i.productId,
      }));
      return {
        summary: `'${args.query}' 검색 → ${result.length}개 상품${priceLabel}`,
        result,
      };
    }
    case "search_reviews": {
      const args = validate(ReviewInput, input);
      const posts = await searchBlog(args.query, { display: 8 });
      return {
        summary: `'${args.query}' 후기 ${posts.length}건 수집`,
        result: posts.map((p) => ({
          title: p.title,
          snippet: p.description,
          date: p.postdate,
          link: p.link,
        })),
      };
    }
    case "search_law": {
      const args = validate(LawInput, input);
      // 캐시는 도구 레벨(가변 LLM 질의)이 아니라 위임 레벨(안정적 사용자 질문)에서 수행 — agents.ts 참고
      const articles = await searchLawGraph(args.question, {
        topK: 4,
        expandHops: 1,
      });
      const vectorHits = articles.filter((a) => a.via === "vector").length;
      const expanded = articles.length - vectorHits;
      return {
        summary: `법령 그래프 검색 → 조문 ${vectorHits}개 + 참조 확장 ${expanded}개`,
        result: articles.map((a) => ({
          law: a.lawName,
          article: a.articleNo,
          title: a.title,
          content: a.content,
          via: a.via,
          expandedFrom: a.expandedFrom,
        })),
      };
    }
    default:
      throw new Error(`알 수 없는 도구: ${name}`);
  }
}

export const SYSTEM_PROMPT = `당신은 "쇼핑 컨시어지"입니다. 한국 이커머스 사용자를 돕는 AI 에이전트로, 두 가지 역할을 수행합니다.

## 역할 1: 상황 기반 상품 추천·비교
- 사용자의 상황(계절, 용도, 예산, 공간 등)을 구체적인 상품 조건으로 해석합니다.
- search_products로 후보를 찾고, 필요하면 search_reviews로 실사용 후기를 확인합니다.
- 추천 시 반드시 근거를 제시합니다: 왜 이 상품인지, 어떤 후기 근거가 있는지.
- 2개 이상 후보를 비교할 때는 가격/핵심 스펙/후기 요약을 표로 정리합니다.

## 역할 2: 소비자 권리·법령 안내
- 환불, 청약철회, 교환, 광고 규제, 약관 관련 질문에는 반드시 search_law를 호출합니다.
- 답변에는 법령명과 조문번호를 명시합니다 (예: 전자상거래법 제17조 제1항).
- 원칙 조문뿐 아니라 함께 반환된 예외·참조 조문을 반드시 검토하고, 예외가 적용될 수 있으면 명시합니다.
- 법률 자문이 아닌 일반 정보 안내임을 답변 끝에 짧게 밝힙니다.

## 행동 원칙
- 절대 도구 결과에 없는 상품 정보나 조문 내용을 지어내지 않습니다.
- 사용자 질문이 모호하면 되묻기보다 합리적인 가정을 명시하고 진행합니다.
- 간결하고 읽기 쉬운 한국어로 답합니다.`;
