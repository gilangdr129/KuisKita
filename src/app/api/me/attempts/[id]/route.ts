import { fail, ok } from "@/lib/http/response";
import { mapRpcError } from "@/lib/attempts/errors";
import { attemptIdSchema } from "@/lib/validation/schemas";
import { createUserClient, getServiceSupabase } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/me/attempts/:id — lihat ulang hasil + pembahasan percobaan sendiri.
 *
 * Memakai RPC yang sama dengan halaman hasil F9 (`get_attempt_result`),
 * sehingga isinya identik. Percobaan yang belum di-submit ditolak 403
 * (ATTEMPT_NOT_SUBMITTED); percobaan milik pengguna lain tidak ada (404).
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
    return fail(request, 401, "UNAUTHORIZED", "Anda harus masuk untuk melihat hasil percobaan.");
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

  const hasil = data as { attempt?: { quiz_id?: string } };
  const quizId = hasil.attempt?.quiz_id ?? null;

  // Judul kuis dibaca lewat service role agar tetap tampil meski kuis sudah
  // ditangguhkan (riwayat pemain tidak boleh kehilangan konteks).
  let kuis: { id: string; judul: string } | null = null;
  if (quizId) {
    const { data: quiz } = await supabase
      .from("quizzes")
      .select("id, judul")
      .eq("id", quizId)
      .maybeSingle();
    kuis = quiz ? { id: String(quiz.id), judul: String(quiz.judul) } : null;
  }

  return ok(request, { ...hasil, kuis });
}