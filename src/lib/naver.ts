const BASE = "https://openapi.naver.com/v1/search";

function headers() {
  return {
    "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID!,
    "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET!,
  };
}

export interface ShoppingItem {
  title: string;
  link: string;
  image: string;
  lprice: string; // 최저가
  hprice: string;
  mallName: string;
  brand: string;
  maker: string;
  category1: string;
  category2: string;
  category3: string;
  productId: string;
}

/** 네이버 쇼핑 검색 */
export async function searchShopping(
  query: string,
  opts: { display?: number; sort?: "sim" | "date" | "asc" | "dsc" } = {}
): Promise<ShoppingItem[]> {
  const params = new URLSearchParams({
    query,
    display: String(opts.display ?? 10),
    sort: opts.sort ?? "sim",
  });
  const res = await fetch(`${BASE}/shop.json?${params}`, { headers: headers() });
  if (!res.ok) throw new Error(`네이버 쇼핑 검색 실패: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.items ?? []).map((it: ShoppingItem) => ({
    ...it,
    title: stripTags(it.title),
  }));
}

export interface BlogItem {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  postdate: string;
}

/** 네이버 블로그 검색 — 상품 후기 텍스트 수집용 */
export async function searchBlog(
  query: string,
  opts: { display?: number } = {}
): Promise<BlogItem[]> {
  const params = new URLSearchParams({
    query,
    display: String(opts.display ?? 10),
    sort: "sim",
  });
  const res = await fetch(`${BASE}/blog.json?${params}`, { headers: headers() });
  if (!res.ok) throw new Error(`네이버 블로그 검색 실패: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.items ?? []).map((it: BlogItem) => ({
    ...it,
    title: stripTags(it.title),
    description: stripTags(it.description),
  }));
}

function stripTags(s: string) {
  return s.replace(/<\/?b>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}
