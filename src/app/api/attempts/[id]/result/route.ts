import { fail, ok } from "@/lib/http/response";
import { mapRpcError } from "@/lib/attempts/errors";
import { attemptIdSchema } from "@/lib/validation/schemas";
import { createUserClient, getServiceSupabase } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/attempts/:id/result — hasil + pembahasan.
 * Hanya untuk pemilik percobaan yang sudah disubmit (403 bila belum).
 */
export async function GET(request: Request, { params }: Props) {
  const { id } = await params;
  const validation = attemptIdSchema.safeParse(id);
  if (!validation.success) {
    return fail(request, 400, "VALIDATION_ERROR", "ID percobaan tidak valid.");
  }

  const session = await createUserClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) {
    return fail(request, 401, "UNAUTHORIZED", "Anda harus masuk untuk melihat hasil.");
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("get_attempt_result", {
    p_attempt_id: validation.data,
    p_user_id: user.id,
  });

  if (error) {
    const mapped = mapRpcError(error);
    return fail(request, mapped.status, mapped.code, mapped.message);
  }

  return ok(request, data);
}
