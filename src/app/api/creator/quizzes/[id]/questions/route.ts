import { fail, ok } from "@/lib/http/response";
import { parseOrFail } from "@/lib/http/validate";
import { ambilKonteksKreator } from "@/lib/creator/kuis";
import { SOAL_SELECT, gagalRpcSoal, keSoalEditor } from "@/lib/creator/soal";
import { getServiceSupabase } from "@/lib/supabase/server";
import { simpanSoalSchema, uuidSchema } from "@/lib/validation/schemas";

type Props = { params: Promise<{ id: string }> };

/**
 * GET /api/creator/quizzes/:id/questions — struktur soal milik sendiri untuk
 * editor. Kunci jawaban tampil sebagai `opsi_benar_id` (data milik pemilik);
 * tabel question_keys sendiri tidak pernah dikirim ke klien.
 */
export async function GET(request: Request, { params }: Props) {
  const { id } = await params;
  const idValid = uuidSchema.safeParse(id);
  if (!idValid.success) {
    return fail(request, 404, "NOT_FOUND", "Kuis tidak ditemukan.");
  }

  const konteks = await ambilKonteksKreator(request);
  if (!konteks.ok) return konteks.response;

  const supabase = getServiceSupabase();

  // Kepemilikan diperiksa eksplisit (RLS service role dilewati).
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, status")
    .eq("id", idValid.data)
    .eq("owner_id", konteks.userId)
    .maybeSingle();

  if (!quiz) {
    return fail(request, 404, "NOT_FOUND", "Kuis tidak ditemukan atau bukan milik Anda.");
  }

  const { data: soal, error } = await supabase
    .from("questions")
    .select(SOAL_SELECT)
    .eq("quiz_id", idValid.data)
    .order("urutan", { ascending: true });

  if (error) {
    return fail(request, 500, "INTERNAL_ERROR", "Gagal memuat soal kuis.");
  }

  const ids = (soal ?? []).map((item) => item.id);
  const kunciPerSoal = new Map<string, string>();
  if (ids.length > 0) {
    const { data: kunci } = await supabase
      .from("question_keys")
      .select("question_id, option_id")
      .in("question_id", ids);
    for (const baris of kunci ?? []) {
      kunciPerSoal.set(baris.question_id, baris.option_id);
    }
  }

  const items = (soal ?? []).map((item) =>
    keSoalEditor(item as unknown as Record<string, unknown>, kunciPerSoal.get(item.id) ?? null),
  );

  return ok(request, { status_kuis: quiz.status, soal: items });
}

/**
 * PUT /api/creator/quizzes/:id/questions — ganti seluruh struktur soal+opsi.
 * Urutan soal mengikuti posisi array (editor menukar posisi dengan tombol
 * naik/turun); kunci dikirim terpisah lewat PUT .../kunci.
 */
export async function PUT(request: Request, { params }: Props) {
  const { id } = await params;
  const idValid = uuidSchema.safeParse(id);
  if (!idValid.success) {
    return fail(request, 404, "NOT_FOUND", "Kuis tidak ditemukan.");
  }

  const parsed = parseOrFail(request, simpanSoalSchema, await request.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const konteks = await ambilKonteksKreator(request);
  if (!konteks.ok) return konteks.response;

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("simpan_soal_kuis", {
    p_user_id: konteks.userId,
    p_quiz_id: idValid.data,
    p_soal: parsed.data.soal,
  });

  if (error) {
    return gagalRpcSoal(request, error, "Gagal menyimpan soal kuis.");
  }

  return ok(request, data);
}