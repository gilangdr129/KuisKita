import { fail, ok } from "@/lib/http/response";
import { parseOrFail } from "@/lib/http/validate";
import { ambilPeringkatKuis } from "@/lib/leaderboard/ambil";
import { createUserClient, getServiceSupabase } from "@/lib/supabase/server";
import { leaderboardQuerySchema, uuidSchema } from "@/lib/validation/schemas";

type Props = { params: Promise<{ id: string }> };

/**
 * GET /api/quizzes/:id/leaderboard — papan peringkat kuis terbit+publik.
 *
 * Urutan: skor desc, durasi_ms asc (skor sama → paling cepat di atas),
 * attempt_id sebagai pemecah terakhir agar stabil. Hanya attempt final
 * (submitted/expired) yang berperingkat; attempt hanya bisa dibuat oleh
 * pengguna login, sehingga setiap entri punya username publik (D1).
 *
 * Cache: Redis TTL 45 s (kunci bernomor versi; invalidasi = INCR versi saat
 * ada submit baru / cron expiry). Tanpa Redis, atau saat `?simulate-redis-down`
 * (hanya di luar produksi), data dibaca dari database — hasil tetap sama.
 *
 * Blok `saya` (posisi pemain yang sedang login) hanya muncul bila ada sesi.
 */
export async function GET(request: Request, { params }: Props) {
  const { id } = await params;
  const idValid = uuidSchema.safeParse(id);
  if (!idValid.success) {
    return fail(request, 404, "NOT_FOUND", "Kuis tidak ditemukan.");
  }

  const url = new URL(request.url);
  const parsed = parseOrFail(request, leaderboardQuerySchema, {
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.ok) return parsed.response;

  // Saklar uji (non-produksi): paksa jalur cache diperlakukan mati.
  const simulasiMati =
    process.env.NODE_ENV !== "production" &&
    ["1", "true"].includes(url.searchParams.get("simulate-redis-down") ?? "");

  const supabase = getServiceSupabase();
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, status, visibilitas")
    .eq("id", idValid.data)
    .maybeSingle();

  if (!quiz || quiz.status !== "published" || quiz.visibilitas !== "public") {
    return fail(request, 404, "NOT_FOUND", "Kuis tidak ditemukan.");
  }

  // Sesi opsional (papan peringkat publik): dipakai untuk blok "posisi Anda".
  let userId: string | null = null;
  try {
    const session = await createUserClient();
    const {
      data: { user },
    } = await session.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  const hasil = await ambilPeringkatKuis(idValid.data, {
    limit: parsed.data.limit,
    cursor: parsed.data.cursor,
    userId,
    redisMati: simulasiMati,
  });

  return ok(request, hasil);
}