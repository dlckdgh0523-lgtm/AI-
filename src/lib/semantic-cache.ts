import { runQuery } from "./neo4j";
import { embedQuery } from "./embeddings";
import { EMBEDDING_DIM } from "./embeddings";

/**
 * 의미 기반 응답 캐시 (Neo4j 벡터 인덱스 재사용).
 *
 * 아이디어: 법령 질문은 표현만 다를 뿐 의미가 반복된다 ("환불 며칠?" ≈ "청약철회 기간?").
 * 질문 임베딩이 캐시된 이전 질문과 코사인 유사도 임계값 이상이면, 저장된 결과를 재사용해
 * 임베딩 1회를 제외한 모든 검색 비용(그래프 순회·후처리)을 건너뛴다.
 *
 * 별도 인프라(Redis 등) 없이 이미 있는 Neo4j로 구현 — "반복 연산 캐싱"이라는 원리만 가져옴.
 * (:CachedQuery {text, embedding, resultJson, hitCount, createdAt})
 */

// 임계값은 측정으로 결정 (scripts/test-cache.ts, measure-sim.ts):
//   같은 질문/패러프레이즈 유사도 0.897~0.918 vs 다른 쟁점 질문 0.654~0.784.
//   0.88은 이 둘 사이(마진 ~0.11)에 위치해, 같은 질문은 히트시키되
//   다른 질문에 잘못된 캐시를 주는 false hit를 막는다. 법률 도메인이라 보수적으로 잡음.
const SIMILARITY_THRESHOLD = 0.88;

export async function setupCacheIndex() {
  await runQuery(
    `CREATE VECTOR INDEX cached_query_embedding IF NOT EXISTS
     FOR (q:CachedQuery) ON (q.embedding)
     OPTIONS {indexConfig: {
       \`vector.dimensions\`: ${EMBEDDING_DIM},
       \`vector.similarity_function\`: 'cosine'
     }}`
  );
}

export interface CacheHit<T> {
  hit: boolean;
  result?: T;
  similarity?: number;
  cachedQuestion?: string;
}

/** 캐시 조회 — 임베딩 유사도 임계값 이상인 이전 질문이 있으면 결과 반환 */
export async function cacheLookup<T>(question: string): Promise<CacheHit<T> & { queryVec: number[] }> {
  const queryVec = await embedQuery(question);
  const rows = await runQuery<{
    text: string;
    resultJson: string;
    score: number;
    id: string;
  }>(
    `CALL db.index.vector.queryNodes('cached_query_embedding', 1, $vec)
     YIELD node, score
     RETURN node.text AS text, node.resultJson AS resultJson, score, elementId(node) AS id`,
    { vec: queryVec }
  );

  const top = rows[0];
  if (top && top.score >= SIMILARITY_THRESHOLD) {
    // 히트 카운트 증가 (관측용)
    await runQuery(
      `MATCH (q:CachedQuery) WHERE elementId(q) = $id SET q.hitCount = coalesce(q.hitCount, 0) + 1`,
      { id: top.id }
    );
    return {
      hit: true,
      result: JSON.parse(top.resultJson) as T,
      similarity: top.score,
      cachedQuestion: top.text,
      queryVec,
    };
  }
  return { hit: false, queryVec };
}

/** 캐시 저장 (조회 시 계산한 임베딩 재사용) */
export async function cacheStore(
  question: string,
  queryVec: number[],
  result: unknown
): Promise<void> {
  await runQuery(
    `CREATE (q:CachedQuery {text: $text, resultJson: $json, hitCount: 0})
     WITH q CALL db.create.setNodeVectorProperty(q, 'embedding', $vec)`,
    { text: question, json: JSON.stringify(result), vec: queryVec }
  );
}
