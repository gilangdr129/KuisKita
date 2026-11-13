import { fail, ok } from "@/lib/http/response";
import { mapRpcError } from "@/lib/attempts/errors";
import { attemptIdSchema } from "@/lib/validation/schemas";
import { createUserClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/attempts/:id — state percobaan: server_now, sisa waktu,
 * snapshot acak, jumlah soal, dan jawaban tersimpan (dasar resume).
 */
export async function GET(request: Request, { params }: Props) {
  const { id } = await params;
  const validation = attemptIdSchema.safeParse(id);
  if (!validation.success) {
    return fail(request, 400, "VALIDATION_ERROR", "ID percobaan tidak valid.");
  }

  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("get_attempt_state", {
    p_attempt_id: validation.data,
  });

  if (error) {
    const mapped = mapRpcError(error);
    return fail(request, mapped.status, mapped.code, mapped.message);
  }

  return ok(request, data);
}
