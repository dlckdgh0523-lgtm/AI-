import { config } from "dotenv";
config({ path: ".env.local" });

import { runQuery, closeDriver } from "../src/lib/neo4j";

async function main() {
  const r = await runQuery("RETURN 1 AS ok");
  console.log("Neo4j 연결 성공:", JSON.stringify(r));
  await closeDriver();
}

main().catch((e) => {
  console.error("Neo4j 연결 실패:", e.message);
  process.exit(1);
});
