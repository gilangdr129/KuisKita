import { revalidateKatalog, revalidateKuis } from "@/lib/cache/katalog";
import { ambilKonteksKreator } from "@/lib/creator/kuis";
import { gagalRpcSoal } from "@/lib/creator/soal";
import { fail, ok } from "@/lib/http/response";
import { getServiceSupabase } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/schemas";

type Props = { params: Promise<{ id: string }> };

/**
 * POST /api/creator/quizzes/:id/publish — terbitkan kuis milik sendiri.
 * Validasi lengkap (minimal soal, tepat 1 kunci per soal, opsi >= 2, gambar
 * dari unggahan media-kuis) dijalankan di database lewat RPC; setelah terbit,
 * cache ISR katalog + detail kuis diperbarui on-demand agar kuis langsung
 * tampil (tanpa menunggu revalidate berkala).
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
  const { data, error } = await supabase.rpc("terbitkan_kuis", {
    p_user_id: konteks.userId,
    p_quiz_id: idValid.data,
  });

  if (error) {
    return gagalRpcSoal(request, error, "Gagal menerbitkan kuis.");
  }

  const hasil = data as { status: string; published_at: string; jumlah_soal: number; sudah_terbit: boolean };

  // Revalidasi on-demand: katalog + halaman detail kuis ini (ISR).
  revalidateKatalog();
  revalidateKuis(idValid.data);

  return ok(request, hasil);
}