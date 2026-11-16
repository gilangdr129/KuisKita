import { ambilKonteksKreator } from "@/lib/creator/kuis";
import { gagalRpcSoal } from "@/lib/creator/soal";
import { fail, ok } from "@/lib/http/response";
import { getServiceSupabase } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/schemas";

type Props = { params: Promise<{ id: string }> };

/**
 * POST /api/creator/quizzes/:id/duplicate — salinan utuh (metadata + soal +
 * opsi + kunci) sebagai draf baru milik pemilik, tanpa percobaan. Ini jalur
 * "versi baru" untuk kuis yang struktur terkunci karena sudah dikerjakan (D4).
 */
export async function POST(request: Request, { params }: Props) {
  const { id } = await params;
  const idValid = uuidSchema.safeParse(id);
  if (!idValid.success) {
    return fail(request, 404, "NOT_FOUND", "Kuis tidak ditemukan.");
  }

  const konteks = await ambilKonteksKreator(request);
  if (!konteks.ok) return konteks.response;

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("duplikasi_kuis", {
    p_user_id: konteks.userId,
    p_quiz_id: idValid.data,
  });

  if (error) {
    return gagalRpcSoal(request, error, "Gagal menduplikasi kuis.");
  }

  const hasil = data as { quiz_id: string; judul: string; status: string; jumlah_soal: number; jumlah_opsi: number };

  return ok(
    request,
    {
      id: hasil.quiz_id,
      judul: hasil.judul,
      status: hasil.status,
      jumlah_soal: hasil.jumlah_soal,
      jumlah_opsi: hasil.jumlah_opsi,
      url_editor: `/dasbor/kuis/${hasil.quiz_id}/soal`,
    },
    { status: 201 },
  );
}