import { config } from "dotenv";
config({ path: ".env.local" });
import { searchShopping } from "../src/lib/naver";

async function main() {
  const items = await searchShopping("무선 이어폰", { display: 3 });
  for (const it of items) {
    console.log(`${it.title.slice(0, 25)} | ${Number(it.lprice).toLocaleString()}원 | ${it.mallName}`);
    console.log(`  이미지: ${it.image}`);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
