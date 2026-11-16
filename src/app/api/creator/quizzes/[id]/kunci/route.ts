import { fail, ok } from "@/lib/http/response";
import { parseOrFail } from "@/lib/http/validate";
import { ambilKonteksKreator } from "@/lib/creator/kuis";
import { gagalRpcSoal } from "@/lib/creator/soal";
import { getServiceSupabase } from "@/lib/supabase/server";
import { kunciInputSchema, uuidSchema } from "@/lib/validation/schemas";

type Props = { params: Promise<{ id: string }> };

/**
 * PUT /api/creator/quizzes/:id/kunci — tetapkan kunci jawaban satu soal.
 * Form hanya mengirim question_id + option_id; penulisan ke question_keys
 * (tanpa policy/grant klien) dilakukan RPC server lewat service role setelah
 * kepemilikan & kecocokan opsi diverifikasi di database.
 */
export async function PUT(request: Request, { params }: Props) {
  const { id } = await params;
  const idValid = uuidSchema.safeParse(id);
  if (!idValid.success) {
    return fail(request, 404, "NOT_FOUND", "Kuis tidak ditemukan.");
  }

  const parsed = parseOrFail(request, kunciInputSchema, await request.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const konteks = await ambilKonteksKreator(request);
  if (!konteks.ok) return konteks.response;

  const supabase = getServiceSupabase();

  // Soal di body harus benar-benar milik kuis yang ada di path.
  const { data: soal } = await supabase
    .from("questions")
    .select("id, quiz_id")
    .eq("id", parsed.data.question_id)
    .maybeSingle();

  if (!soal || soal.quiz_id !== idValid.data) {
    return fail(request, 404, "NOT_FOUND", "Soal tidak ditemukan pada kuis ini.");
  }

  const { data, error } = await supabase.rpc("simpan_kunci_jawaban", {
    p_user_id: konteks.userId,
    p_question_id: parsed.data.question_id,
    p_option_id: parsed.data.option_id,
  });

  if (error) {
    return gagalRpcSoal(request, error, "Gagal menyimpan kunci jawaban.");
  }

  return ok(request, data);
}