import { createClient } from "@supabase/supabase-js";

export const maxDuration = 30;

/**
 * 대시보드용 대화 로그 조회 (서버 사이드).
 *
 * 기존에는 /admin 페이지가 NEXT_PUBLIC anon 키로 Supabase를 직접 읽었는데,
 * anon 키는 JS 번들에 공개되므로 누구나 Supabase REST API로 전체 로그를
 * 읽고 쓸 수 있었다. 읽기를 이 서버 라우트로 옮기고, Supabase에는 RLS로
 * anon의 SELECT를 차단하는 것을 전제로 한다 (README의 RLS 설정 참고).
 *
 * SUPABASE_SERVICE_ROLE_KEY(서버 전용)가 설정돼 있으면 그것으로 읽고,
 * 없으면 anon 키로 폴백해 기존 배포가 깨지지 않게 한다.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ rows: [] });

  const sb = createClient(url, key);
  const { data, error } = await sb
    .from("conversations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ rows: data ?? [] });
}
