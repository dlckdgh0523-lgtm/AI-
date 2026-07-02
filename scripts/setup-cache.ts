import { config } from "dotenv";
config({ path: ".env.local" });

import { setupCacheIndex } from "../src/lib/semantic-cache";
import { runQuery, closeDriver } from "../src/lib/neo4j";

async function main() {
  await setupCacheIndex();
  const idx = await runQuery<{ name: string; state: string }>(
    `SHOW INDEXES YIELD name, state WHERE name = 'cached_query_embedding' RETURN name, state`
  );
  console.log("캐시 인덱스:", JSON.stringify(idx));
  await closeDriver();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
