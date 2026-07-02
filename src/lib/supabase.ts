import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface ConversationLog {
  question: string;
  answer: string;
  traces: unknown[];
  usage: { input_tokens: number; output_tokens: number; cache_read?: number };
}

/** 대화 로그 저장 (실패해도 채팅 흐름에 영향 없도록 호출부에서 fire-and-forget) */
export async function logConversation(log: ConversationLog) {
  const { error } = await supabase.from("conversations").insert(log);
  if (error) console.error("대화 로그 저장 실패:", error.message);
}
