import { cacheLife, cacheTag, revalidatePath, revalidateTag } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/server";
import { quizFiltersSchema, attemptIdSchema } from "@/lib/validation/schemas";

/**
 * Lapisan cache ISR untuk data publik (PRD §16): katalog & detail kuis
 * dibaca lewat fungsi "use cache" dengan tag, sehingga penerbitan atau
 * penangguhan kuis bisa memicu revalidasi on-demand (dipakai F14).
 */

export type KatalogParams = {
  kategori?: string;
  kesulitan?: string;
  durasi?: string;
  q?: string;
  sortir?: string;
  limit?: number;
  cursor?: string;
};

export type KatalogItem = {
  id: string;
  judul: string;
  deskripsi: string | null;
  kesulitan: string;
  durasi_detik: number;
  published_at: string | null;
  kategori: { nama: string | null; slug: string | null };
  kreator_username: string | null;
  jumlah_soal: number;
  jumlah_percobaan: number;
  skor_tertinggi: number | null;
};

export type KatalogResult = {
  items: KatalogItem[];
  next_cursor: string | null;
  has_more: boolean;
};

export type KuisDetail = {
  id: string;
  judul: string;
  deskripsi: string | null;
  kesulitan: string;
  durasi_detik: number;
  status: string;
  visibilitas: string;
  kreator_username: string | null;
  soal: {
    id: string;
    teks: string;
    tipe: string;
    bobot: number;
    urutan: number;
    gambar_url: string | null;
    opsi: { id: string; teks: string; urutan: number }[];
  }[];
};

/** Ambil satu halaman katalog (published + public saja). */
export async function ambilKatalog(params: KatalogParams): Promise<KatalogResult> {
  "use cache";
  cacheTag("katalog");
  cacheLife({ revalidate: 3600, stale: 600 });

  const parsed = quizFiltersSchema.parse({
    kategori: params.kategori,
    kesulitan: params.kesulitan,
    durasi: params.durasi,
    q: params.q,
    sortir: params.sortir ?? "terbaru",
    limit: params.limit ?? 20,
    cursor: params.cursor,
  });

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("list_quizzes", {
    p_kategori: parsed.kategori ?? null,
    p_kesulitan: parsed.kesulitan ?? null,
    p_durasi: parsed.durasi ?? null,
    p_q: parsed.q ?? null,
    p_sortir: parsed.sortir,
    p_limit: parsed.limit,
    p_cursor: parsed.cursor ?? null,
  });

  if (error || !data) {
    return { items: [], next_cursor: null, has_more: false };
  }

  // Kursor dinormalkan menjadi string JSON agar mudah dikirim balik sebagai
  // query parameter (?cursor=...).
  const hasil = data as { items: KatalogItem[]; next_cursor: unknown; has_more: boolean };
  return {
    items: hasil.items ?? [],
    next_cursor: hasil.next_cursor ? JSON.stringify(hasil.next_cursor) : null,
    has_more: Boolean(hasil.has_more),
  };
}

/** Detail kuis + soal (tanpa kunci jawaban) untuk halaman detail publik. */
export async function ambilKuisDetail(id: string): Promise<KuisDetail | null> {
  "use cache";
  cacheTag("katalog", `kuis:${id}`);
  cacheLife({ revalidate: 3600, stale: 600 });

  const idValid = attemptIdSchema.safeParse(id);
  if (!idValid.success) return null;

  const supabase = getServiceSupabase();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, judul, deskripsi, kesulitan, durasi_detik, status, visibilitas, profiles ( username )")
    .eq("id", idValid.data)
    .eq("status", "published")
    .eq("visibilitas", "public")
    .maybeSingle();

  if (!quiz) return null;

  // PostgREST: embed to-one bisa berupa objek (umumnya) atau array (fallback).
  const embed = quiz.profiles as { username: string } | { username: string }[] | null;
  const kreatorUsername = Array.isArray(embed) ? embed[0]?.username ?? null : embed?.username ?? null;

  const { data: soal } = await supabase
    .from("questions")
    .select("id, teks, tipe, bobot, urutan, gambar_url, options ( id, teks, urutan )")
    .eq("quiz_id", idValid.data)
    .order("urutan", { ascending: true });

  return {
    id: quiz.id,
    judul: quiz.judul,
    deskripsi: quiz.deskripsi,
    kesulitan: quiz.kesulitan,
    durasi_detik: quiz.durasi_detik,
    status: quiz.status,
    visibilitas: quiz.visibilitas,
    kreator_username: kreatorUsername,
    soal: (soal ?? []).map((item) => ({
      id: item.id,
      teks: item.teks,
      tipe: item.tipe,
      bobot: Number(item.bobot),
      urutan: item.urutan,
      gambar_url: item.gambar_url,
      opsi: (item.options ?? []).map((o) => ({ id: o.id, teks: o.teks, urutan: o.urutan })),
    })),
  };
}

/**
 * Revalidasi on-demand (dipakai F14 saat kuis diterbitkan/diubah/ditangguhkan,
 * dan F9 setelah percobaan baru agar skor tertinggi & jumlah percobaan segar).
 * Argumen kedua revalidateTag menentukan profil cache (stale-while-revalidate).
 */
export async function revalidateKatalog(): Promise<void> {
  revalidateTag("katalog", "max");
  revalidatePath("/kuis");
}

export async function revalidateKuis(id: string): Promise<void> {
  revalidateTag(`kuis:${id}`, "max");
  revalidateTag("katalog", "max");
  revalidatePath(`/kuis/${id}`);
  revalidatePath("/kuis");
}