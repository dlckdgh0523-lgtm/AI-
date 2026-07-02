import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** 지연 초기화 — 빌드/프리렌더 시점에 env가 없어도 크래시하지 않게 */
function getClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key);
  return client;
}

export interface ConversationLog {
  question: string;
  answer: string;
  traces: unknown[];
  usage: { input_tokens: number; output_tokens: number; cache_read?: number };
}

/** 대화 로그 저장 (실패해도 채팅 흐름에 영향 없도록 fire-and-forget). env 없으면 조용히 skip */
export async function logConversation(log: ConversationLog) {
  const sb = getClient();
  if (!sb) return;
  const { error } = await sb.from("conversations").insert(log);
  if (error) console.error("대화 로그 저장 실패:", error.message);
}
