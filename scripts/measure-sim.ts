import { config } from "dotenv";
config({ path: ".env.local" });
import { embedQuery } from "../src/lib/embeddings";
import { runQuery, closeDriver } from "../src/lib/neo4j";

async function main() {
  const qs = await runQuery<{ text: string }>(`MATCH (q:CachedQuery) RETURN q.text AS text`);
  if (qs.length < 2) {
    console.log("캐시 항목이 2개 미만");
    await closeDriver();
    return;
  }
  const vec = await embedQuery(qs[0].text);
  const rows = await runQuery<{ text: string; score: number }>(
    `CALL db.index.vector.queryNodes('cached_query_embedding', 3, $vec)
     YIELD node, score RETURN node.text AS text, score`,
    { vec }
  );
  console.log(`기준: ${qs[0].text.slice(0, 50)}`);
  for (const r of rows) console.log(`  ${r.score.toFixed(4)} | ${r.text.slice(0, 50)}`);
  await closeDriver();
}
main().catch((e) => { console.error(e); process.exit(1); });
