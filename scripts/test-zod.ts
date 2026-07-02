import { config } from "dotenv";
config({ path: ".env.local" });
import { executeTool } from "../src/lib/tools";

async function expectReject(name: string, input: Record<string, unknown>, label: string) {
  try {
    await executeTool(name, input);
    console.log(`🔴 ${label}: 거부 안 됨(문제)`);
  } catch (e) {
    console.log(`🟢 ${label}: ${e instanceof Error ? e.message : e}`);
  }
}

async function main() {
  await expectReject("search_products", { query: "" }, "빈 검색어");
  await expectReject("search_law", {}, "질문 누락");
  await expectReject("search_products", { query: "노트북", sort: "invalid" }, "잘못된 sort");
  await expectReject("search_products", { query: "노트북", max_price: -100 }, "음수 예산");
  process.exit(0);
}
main();
