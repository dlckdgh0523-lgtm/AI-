import { VoyageAIClient } from "voyageai";

let client: VoyageAIClient | null = null;

function getClient() {
  if (!client) {
    client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY! });
  }
  return client;
}

export const EMBEDDING_MODEL = "voyage-3.5";
export const EMBEDDING_DIM = 1024;

/** 텍스트 배열을 임베딩 (배치 처리, 문서용) */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const res = await getClient().embed({
    input: texts,
    model: EMBEDDING_MODEL,
    inputType: "document",
  });
  return (res.data ?? []).map((d) => d.embedding as number[]);
}

/** 검색 질의 임베딩 */
export async function embedQuery(text: string): Promise<number[]> {
  const res = await getClient().embed({
    input: [text],
    model: EMBEDDING_MODEL,
    inputType: "query",
  });
  return (res.data?.[0]?.embedding as number[]) ?? [];
}
