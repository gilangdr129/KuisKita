import { Redis } from "@upstash/redis";
import { getServerEnv } from "@/lib/env";

/**
 * Cache papan peringkat (PRD §16): entri peringkat disimpan di Redis dengan
 * TTL 45 detik. Invalidasi tidak memakai SCAN — setiap kuis punya "nomor
 * versi" (`peringkat:versi:<id>`); submit baru menaikkannya (INCR) sehingga
 * seluruh halaman cache lama otomatis tak terbaca (kunci memasukkan versi).
 *
 * Tanpa env Upstash (mis. dev lokal) semua aman: Redis dianggap mati dan data
 * selalu dibaca dari database.
 */

/** TTL entri cache (detik) — di rentang 30–60 detik sesuai rencana. */
export const PERINGKAT_TTL_DETIK = 45;

/** Batas jumlah entri peringkat yang dibaca dari DB untuk satu kuis. */
export const PERINGKAT_MAKS_BACA = 500;

/** Opsi bersama: `mati` memaksa jalur cache diperlakukan sebagai gagal. */
export type OpsiRedis = { mati?: boolean };

let klien: Redis | null | undefined;

/** Klien Redis bersama; null bila env belum diset (cache dinonaktifkan). */
export function ambilRedis(): Redis | null {
  if (klien !== undefined) return klien;

  const env = getServerEnv();
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    klien = null;
    return klien;
  }

  klien = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return klien;
}

const KUNCI_VERSI = (quizId: string) => `peringkat:versi:${quizId}`;
const KUNCI_DAFTAR = (quizId: string, versi: number) => `peringkat:${quizId}:v${versi}`;

type KeluaranBaca<T> = { kenal: boolean; nilai: T | null };

/**
 * Baca cache daftar peringkat. `kenal` false berarti cache tak terbukti
 * (Redis mati/kosong/rusak) → pemanggil harus membaca DB.
 */
export async function bacaPeringkat<T>(quizId: string, opsi: OpsiRedis = {}): Promise<KeluaranBaca<T>> {
  const redis = opsi.mati ? null : ambilRedis();
  if (!redis) return { kenal: false, nilai: null };

  try {
    const versiMentah = await redis.get<number>(KUNCI_VERSI(quizId));
    let versi = typeof versiMentah === "number" ? versiMentah : 0;
    if (versiMentah === null) {
      // Versi awal tanpa TTL: daftar cache lama tak akan pernah terbaca lagi
      // setelah versi naik (kunci daftar memuat versi).
      await redis.set(KUNCI_VERSI(quizId), 0);
      versi = 0;
    }

    const mentah = await redis.get<unknown>(KUNCI_DAFTAR(quizId, versi));
    if (mentah === null || mentah === undefined) return { kenal: false, nilai: null };
    return { kenal: true, nilai: mentah as T };
  } catch {
    // Redis gagal (jaringan/dll): fallback DB, jangan menggagalkan request.
    return { kenal: false, nilai: null };
  }
}

/** Simpan daftar peringkat ke cache (diamkan bila Redis mati/tidak ada). */
export async function simpanPeringkat(quizId: string, daftar: unknown, opsi: OpsiRedis = {}): Promise<void> {
  const redis = opsi.mati ? null : ambilRedis();
  if (!redis) return;

  try {
    const versiMentah = await redis.get<number>(KUNCI_VERSI(quizId));
    const versi = typeof versiMentah === "number" ? versiMentah : 0;
    await redis.set(KUNCI_DAFTAR(quizId, versi), daftar, { ex: PERINGKAT_TTL_DETIK });
  } catch {
    // Cache adalah optimasi; kegagalan tulis tidak dibublekan.
  }
}

/**
 * Invalidasi cache papan peringkat sebuah kuis (dipanggil setelah submit baru
 * atau cron expiry): naikkan versi agar semua entri lama tak terbaca.
 */
export async function nonaktifkanPeringkat(quizId: string): Promise<void> {
  const redis = ambilRedis();
  if (!redis) return;

  try {
    await redis.incr(KUNCI_VERSI(quizId));
  } catch {
    // Invalidasi gagal bukan alasan menggagalkan submit/percobaan.
  }
}