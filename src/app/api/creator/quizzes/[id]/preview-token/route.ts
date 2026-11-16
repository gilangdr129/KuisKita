import { fail, ok } from "@/lib/http/response";
import { ambilKonteksKreator } from "@/lib/creator/kuis";
import { gagalRpcSoal } from "@/lib/creator/soal";
import { getServiceSupabase } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/schemas";

type Props = { params: Promise<{ id: string }> };

const MASA_BERLAKU_MENIT = 30;

/**
 * POST /api/creator/quizzes/:id/preview-token — buat tautan pratinjau draft.
 * Token terikat kuis + pemilik, kedaluwarsa 30 menit; hanya pemilik yang bisa
 * membuka halaman pratinjau (sesi dicocokkan dengan token).
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
  const { data, error } = await supabase.rpc("buat_token_pratinjau", {
    p_user_id: konteks.userId,
    p_quiz_id: idValid.data,
  });

  if (error) {
    return gagalRpcSoal(request, error, "Gagal membuat tautan pratinjau.");
  }

  const hasil = data as { token: string; kedaluwarsa: string };
  return ok(
    request,
    {
      token: hasil.token,
      kedaluwarsa: hasil.kedaluwarsa,
      berlaku_menit: MASA_BERLAKU_MENIT,
      url: `/pratinjau/${hasil.token}`,
    },
    { status: 201 },
  );
}