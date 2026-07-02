import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { maskPII } from "./pii";

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

/** 대화 로그 저장 (실패해도 채팅 흐름에 영향 없도록 fire-and-forget). env 없으면 조용히 skip.
 *  저장 전 PII(카드·주민·전화·이메일) 마스킹 — 저장소 유출 시 피해 최소화 */
export async function logConversation(log: ConversationLog) {
  const sb = getClient();
  if (!sb) return;
  const safe = {
    ...log,
    question: maskPII(log.question).masked,
    answer: maskPII(log.answer).masked,
  };
  const { error } = await sb.from("conversations").insert(safe);
  if (error) console.error("대화 로그 저장 실패:", error.message);
}
