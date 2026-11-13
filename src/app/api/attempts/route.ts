import { fail, ok } from "@/lib/http/response";
import { parseOrFail } from "@/lib/http/validate";
import { mapRpcError } from "@/lib/attempts/errors";
import { startAttemptSchema } from "@/lib/validation/schemas";
import { createUserClient, getServiceSupabase } from "@/lib/supabase/server";

/**
 * POST /api/attempts — mulai percobaan (idempoten).
 *
 * Server yang menentukan started_at, expires_at, dan snapshot acak lewat RPC
 * start_attempt; RPC dipanggil memakai service role + user id hasil verifikasi
 * sesi (EXECUTE RPC sudah dicabut dari anon/authenticated).
 */
export async function POST(request: Request) {
  const parsed = parseOrFail(request, startAttemptSchema, await request.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const session = await createUserClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) {
    return fail(request, 401, "UNAUTHORIZED", "Anda harus masuk untuk mengerjakan kuis.");
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("start_attempt", {
    p_quiz_id: parsed.data.quiz_id,
    p_user_id: user.id,
  });

  if (error) {
    const mapped = mapRpcError(error);
    return fail(request, mapped.status, mapped.code, mapped.message);
  }

  const dibuatBaru = (data as { dibuat_baru?: boolean } | null)?.dibuat_baru ?? false;
  return ok(request, data, { status: dibuatBaru ? 201 : 200 });
}
