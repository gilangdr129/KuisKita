import { fail, ok } from "@/lib/http/response";
import { parseOrFail } from "@/lib/http/validate";
import { mapRpcError } from "@/lib/attempts/errors";
import { attemptIdSchema, saveAnswerSchema } from "@/lib/validation/schemas";
import { createUserClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * PUT /api/attempts/:id/answers — simpan satu jawaban (autosave).
 *
 * Validasi kepemilikan, status percobaan, batas waktu server, dan kecocokan
 * opsi↔soal dilakukan di dalam RPC save_attempt_answer (SECURITY DEFINER).
 */
export async function PUT(request: Request, { params }: Props) {
  const { id } = await params;

  const attemptValidation = attemptIdSchema.safeParse(id);
  if (!attemptValidation.success) {
    return fail(request, 400, "VALIDATION_ERROR", "ID percobaan tidak valid.");
  }

  const parsed = parseOrFail(request, saveAnswerSchema, await request.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc("save_attempt_answer", {
    p_attempt_id: attemptValidation.data,
    p_question_id: parsed.data.pertanyaan_id,
    p_option_id: parsed.data.opsi_id,
  });

  if (error) {
    const mapped = mapRpcError(error);
    return fail(request, mapped.status, mapped.code, mapped.message);
  }

  return ok(request, data);
}
