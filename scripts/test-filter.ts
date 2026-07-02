import { config } from "dotenv";
config({ path: ".env.local" });
import { executeTool } from "../src/lib/tools";

async function main() {
  const r = await executeTool("search_products", {
    query: "선풍기",
    min_price: 30000,
    max_price: 80000,
    sort: "asc",
  });
  console.log(r.summary);
  for (const p of (r.result as { price: number; title: string }[]).slice(0, 5)) {
    console.log(`  ${p.price.toLocaleString()}원 | ${p.title.slice(0, 35)}`);
  }
  // 범위 밖 상품이 없는지 검증
  const outOfRange = (r.result as { price: number }[]).filter(
    (p) => p.price < 30000 || p.price > 80000
  );
  console.log(`\n범위(3만~8만원) 밖 상품: ${outOfRange.length}개 (0이어야 정상)`);
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
