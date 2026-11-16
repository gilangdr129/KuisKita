import { ok } from "@/lib/http/response";
import { parseOrFail } from "@/lib/http/validate";
import { KUIS_SELECT, ambilKonteksKreator, keKuisKreator, mapKuisError, resolveKategori } from "@/lib/creator/kuis";
import { quizCreateSchema } from "@/lib/validation/schemas";

/**
 * GET /api/creator/quizzes — daftar "Kuis saya": semua kuis milik pengguna
 * yang login (termasuk draf & tangguh), terbaru perubahan di atas.
 * RLS + filter eksplisit owner_id memastikan daftar hanya milik sendiri.
 */
export async function GET(request: Request) {
  const konteks = await ambilKonteksKreator(request);
  if (!konteks.ok) return konteks.response;

  const { data, error } = await konteks.supabase
    .from("quizzes")
    .select(KUIS_SELECT)
    .eq("owner_id", konteks.userId)
    .order("updated_at", { ascending: false });

  if (error) {
    return mapKuisError(request, error, "Gagal memuat daftar kuis.");
  }

  const items = (data ?? []).map((row) => keKuisKreator(row as unknown as Record<string, unknown>));
  return ok(request, { items, total: items.length });
}

/**
 * POST /api/creator/quizzes — buat kuis baru (selalu draft).
 * Terbitan dibuat lewat F14 agar validasi "minimal soal & kunci" berlaku;
 * status/owner tidak dapat dikirim klien.
 */
export async function POST(request: Request) {
  const parsed = parseOrFail(request, quizCreateSchema, await request.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const konteks = await ambilKonteksKreator(request);
  if (!konteks.ok) return konteks.response;

  const kategori = await resolveKategori(konteks.supabase, parsed.data.kategori, request);
  if (!kategori.ok) return kategori.response;

  const { data, error } = await konteks.supabase
    .from("quizzes")
    .insert({
      owner_id: konteks.userId,
      judul: parsed.data.judul,
      deskripsi: parsed.data.deskripsi,
      durasi_detik: parsed.data.durasi_detik,
      kesulitan: parsed.data.kesulitan,
      category_id: kategori.categoryId,
      acak_soal: parsed.data.acak_soal,
      acak_opsi: parsed.data.acak_opsi,
      maks_percobaan: parsed.data.maks_percobaan ?? null,
      visibilitas: parsed.data.visibilitas,
      // draft dibuat eksplisit: terbit hanya lewat F14.
      status: "draft",
    })
    .select(KUIS_SELECT)
    .single();

  if (error || !data) {
    return mapKuisError(request, error, "Gagal membuat kuis.");
  }

  return ok(request, keKuisKreator(data as unknown as Record<string, unknown>), { status: 201 });
}