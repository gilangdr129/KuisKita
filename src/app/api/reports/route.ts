import { fail, ok } from "@/lib/http/response";
import { parseOrFail } from "@/lib/http/validate";
import { createUserClient } from "@/lib/supabase/server";
import { laporanSchema } from "@/lib/validation/schemas";

/**
 * POST /api/reports — laporkan kuis publik (opsional F17).
 * Penulisan memakai klien ter-sesi: policy `reports_write_self` memastikan
 * `reporter_id` laporan selalu pengguna yang sedang login.
 */
export async function POST(request: Request) {
  const parsed = parseOrFail(request, laporanSchema, await request.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail(request, 401, "UNAUTHORIZED", "Anda harus masuk untuk melaporkan kuis.");
  }

  // Hanya kuis yang terbit+publik yang dapat dilaporkan.
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, status, visibilitas")
    .eq("id", parsed.data.quiz_id)
    .maybeSingle();

  if (!quiz || quiz.status !== "published" || quiz.visibilitas !== "public") {
    return fail(request, 404, "NOT_FOUND", "Kuis tidak ditemukan.");
  }

  // Tidak ada select balik: policy SELECT reports hanya untuk admin, sehingga
  // membaca ulang baris insert sebagai pemain selalu gagal RLS.
  const { error } = await supabase
    .from("reports")
    .insert({ quiz_id: parsed.data.quiz_id, reporter_id: user.id, alasan: parsed.data.alasan });

  if (error) {
    return fail(request, 500, "INTERNAL_ERROR", "Gagal menyimpan laporan.");
  }

  return ok(
    request,
    { quiz_id: parsed.data.quiz_id, alasan: parsed.data.alasan, status: "open" },
    { status: 201 },
  );
}