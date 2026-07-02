import { runQuery } from "@/lib/neo4j";

export const maxDuration = 30;

/**
 * 대시보드 인사이트 (서버 사이드 — Neo4j 자격증명 필요).
 *
 * 법령 지식그래프를 비즈니스 인사이트로 연결:
 *  - 핵심 조문 랭킹: 참조 관계(REFERS_TO) 중심성이 높은 조문 = 소비자 이슈가 얽히는 핵심 조문
 *  - 그래프 규모: 온톨로지 커버리지
 */
export async function GET() {
  try {
    // 참조 in-degree(다른 조문이 이 조문을 인용하는 횟수) 기준 핵심 조문
    const topArticles = await runQuery<{
      law: string;
      article: string;
      title: string;
      refs: { low: number; high: number } | number;
    }>(
      `MATCH (a:Article)
       OPTIONAL MATCH (a)<-[r:REFERS_TO]-(:Article)
       WITH a, count(r) AS refs
       WHERE refs > 0
       RETURN a.lawName AS law, a.articleNo AS article, a.title AS title, refs
       ORDER BY refs DESC LIMIT 8`
    );

    const [scale] = await runQuery<{
      laws: number;
      articles: number;
      refs: number;
    }>(
      `MATCH (l:Law) WITH count(l) AS laws
       MATCH (a:Article) WITH laws, count(a) AS articles
       OPTIONAL MATCH ()-[r:REFERS_TO]->()
       RETURN laws, articles, count(r) AS refs`
    );

    const toNum = (v: { low: number } | number) =>
      typeof v === "number" ? v : v.low;

    return Response.json({
      topArticles: topArticles.map((a) => ({
        law: a.law,
        article: a.article,
        title: a.title,
        refs: toNum(a.refs),
      })),
      scale: {
        laws: toNum(scale.laws as unknown as { low: number } | number),
        articles: toNum(scale.articles as unknown as { low: number } | number),
        refs: toNum(scale.refs as unknown as { low: number } | number),
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
