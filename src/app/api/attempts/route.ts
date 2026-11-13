import { fail, ok } from "@/lib/http/response";
import { parseOrFail } from "@/lib/http/validate";
import { mapRpcError } from "@/lib/attempts/errors";
import { startAttemptSchema } from "@/lib/validation/schemas";
import { createUserClient } from "@/lib/supabase/server";

/**
 * POST /api/attempts — mulai percobaan (idempoten).
 *
 * Server yang menentukan started_at, expires_at, dan snapshot acak lewat RPC
 * start_attempt; client tidak pernah menulis tabel attempts secara langsung.
 */
export async function POST(request: Request) {
  const parsed = parseOrFail(request, startAttemptSchema, await request.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("start_attempt", {
    p_quiz_id: parsed.data.quiz_id,
  });

  if (error) {
    const mapped = mapRpcError(error);
    return fail(request, mapped.status, mapped.code, mapped.message);
  }

  const dibuatBaru = (data as { dibuat_baru?: boolean } | null)?.dibuat_baru ?? false;
  return ok(request, data, { status: dibuatBaru ? 201 : 200 });
}
