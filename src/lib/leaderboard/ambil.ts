import { getServiceSupabase } from "@/lib/supabase/server";
import { bacaPeringkat, PERINGKAT_MAKS_BACA, simpanPeringkat } from "@/lib/leaderboard/redis";

/** Satu baris papan peringkat (publik: tanpa user_id). */
export type PeringkatEntri = {
  peringkat: number;
  attempt_id: string;
  username: string | null;
  skor: number;
  persentase: number | null;
  durasi_ms: number;
  submitted_at: string;
};

/** Baris internal: membawa user_id untuk mencari posisi pemain. */
type BarisInternal = PeringkatEntri & { user_id: string };

export type PeringkatHalaman = {
  items: PeringkatEntri[];
  total: number;
  next_cursor: string | null;
  saya: PeringkatEntri | null;
  sumber: "cache" | "database";
};

type Kursor = { s: number; d: number; i: string };

/** Baca kursor paginasi; kursor rusak diabaikan (mulai dari atas). */
export function bacaKursor(mentah: string | undefined): Kursor | null {
  if (!mentah) return null;
  try {
    const isi = JSON.parse(mentah) as Partial<Kursor>;
    if (
      typeof isi?.s === "number" &&
      typeof isi?.d === "number" &&
      typeof isi?.i === "string"
    ) {
      return { s: isi.s, d: isi.d, i: isi.i };
    }
    return null;
  } catch {
    return null;
  }
}

export function tulisKursor(entri: PeringkatEntri): string {
  return JSON.stringify({ s: entri.skor, d: entri.durasi_ms, i: entri.attempt_id });
}

/** Entri yang berada SETELAH posisi kursor (urut skor desc, durasi asc, id asc). */
function setelahKursor(entri: BarisInternal, kursor: Kursor | null): boolean {
  if (!kursor) return true;
  if (entri.skor < kursor.s) return true;
  if (entri.skor > kursor.s) return false;
  if (entri.durasi_ms > kursor.d) return true;
  if (entri.durasi_ms < kursor.d) return false;
  return entri.attempt_id > kursor.i;
}

/**
 * Ambil daftar peringkat kuis dari DB (attempt final: submitted/expired,
 * skor & durasi wajib ada). Hanya pengguna login yang punya attempt, jadi
 * setiap entri otomatis punya username publik (D1).
 */
async function peringkatDariDb(quizId: string): Promise<BarisInternal[]> {
  const supabase = getServiceSupabase();

  const { data } = await supabase
    .from("attempts")
    .select("id, user_id, skor, persentase, durasi_ms, submitted_at, profiles ( username )")
    .eq("quiz_id", quizId)
    .in("status", ["submitted", "expired"])
    .not("skor", "is", null)
    .not("durasi_ms", "is", null)
    .order("skor", { ascending: false })
    .order("durasi_ms", { ascending: true })
    .order("id", { ascending: true })
    .limit(PERINGKAT_MAKS_BACA);

  return (data ?? []).map((row, index) => {
    const embed = row.profiles as { username: string } | { username: string }[] | null;
    const username = Array.isArray(embed) ? embed[0]?.username ?? null : embed?.username ?? null;
    return {
      peringkat: index + 1,
      attempt_id: String(row.id),
      user_id: String(row.user_id),
      username,
      skor: Number(row.skor),
      persentase: row.persentase == null ? null : Number(row.persentase),
      durasi_ms: Number(row.durasi_ms),
      submitted_at: String(row.submitted_at),
    };
  });
}

/**
 * Siapkan satu halaman papan peringkat: cache Redis (TTL) → fallback DB,
 * lalu slice kursor + hitung posisi pemain yang sedang login.
 */
export async function ambilPeringkatKuis(
  quizId: string,
  opsi: { limit: number; cursor?: string; userId?: string | null; redisMati?: boolean },
): Promise<PeringkatHalaman> {
  const kursor = bacaKursor(opsi.cursor);
  const opsiRedis = { mati: opsi.redisMati };

  let daftar: BarisInternal[];
  let sumber: PeringkatHalaman["sumber"] = "database";

  const cache = await bacaPeringkat<BarisInternal[]>(quizId, opsiRedis);
  if (cache.kenal && Array.isArray(cache.nilai)) {
    daftar = cache.nilai;
    sumber = "cache";
  } else {
    daftar = await peringkatDariDb(quizId);
    await simpanPeringkat(quizId, daftar, opsiRedis);
  }

  const sisipan = daftar.filter((entri) => setelahKursor(entri, kursor));
  const halaman = sisipan.slice(0, opsi.limit);
  const adaLagi = sisipan.length > opsi.limit;
  const terakhir = halaman[halaman.length - 1];

  let saya: PeringkatEntri | null = null;
  if (opsi.userId) {
    const milikSaya = daftar.find((entri) => entri.user_id === opsi.userId);
    if (milikSaya) {
      const { user_id: _user_id, ...publik } = milikSaya;
      saya = publik;
    }
  }

  return {
    items: halaman.map(({ user_id: _user_id, ...publik }) => publik),
    total: daftar.length,
    next_cursor: adaLagi && terakhir ? tulisKursor(terakhir) : null,
    saya,
    sumber,
  };
}