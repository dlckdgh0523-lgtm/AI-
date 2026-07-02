import { config } from "dotenv";
config({ path: ".env.local" });
import { runQuery, closeDriver } from "../src/lib/neo4j";

async function main() {
  const rows = await runQuery<{ n: number; hits: number }>(
    `MATCH (q:CachedQuery) RETURN count(q) AS n, sum(coalesce(q.hitCount,0)) AS hits`
  );
  const sample = await runQuery<{ text: string; hitCount: number }>(
    `MATCH (q:CachedQuery) RETURN q.text AS text, coalesce(q.hitCount,0) AS hitCount ORDER BY hitCount DESC LIMIT 5`
  );
  console.log("캐시 통계:", JSON.stringify(rows[0]));
  for (const s of sample) console.log(`  [${s.hitCount}회 히트] ${s.text.slice(0, 60)}`);
  await closeDriver();
}
main().catch((e) => { console.error(e); process.exit(1); });
