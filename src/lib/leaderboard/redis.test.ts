import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tes cache papan peringkat (F15) memakai Redis palsu in-memory:
 *   - miss → tulis → hit
 *   - invalidasi (INCR versi) membuat entri lama tak terbaca lagi
 *   - saklar `mati` (simulasi Redis tumbang) selalu jatuh ke DB
 */

const penyimpanan = new Map<string, unknown>();

vi.mock("@upstash/redis", () => {
  class RedisPalsu {
    async get(kunci: string) {
      return penyimpanan.has(kunci) ? penyimpanan.get(kunci) : null;
    }
    async set(kunci: string, nilai: unknown) {
      penyimpanan.set(kunci, nilai);
      return "OK";
    }
    async incr(kunci: string) {
      const lama = penyimpanan.get(kunci);
      const nilai = (typeof lama === "number" ? lama : 0) + 1;
      penyimpanan.set(kunci, nilai);
      return nilai;
    }
  }
  return { Redis: RedisPalsu };
});

// Env minimal agar getServerEnv() lolos saat klien dibuat.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://contoh.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "kunci-anon-uji-yang-cukup-panjang";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "kunci-service-uji-yang-cukup-panjang";
process.env.UPSTASH_REDIS_REST_URL ??= "https://contoh.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN ??= "token-uji";

const { bacaPeringkat, simpanPeringkat, nonaktifkanPeringkat } = await import("@/lib/leaderboard/redis");

const QUIZ = "8b6221bc-ca21-4500-a0ea-4ba5a10434e7";

describe("cache papan peringkat (F15)", () => {
  beforeEach(() => {
    penyimpanan.clear();
  });

  it("miss saat belum ada cache, hit setelah disimpan", async () => {
    const awal = await bacaPeringkat<string[]>(QUIZ);
    expect(awal.kenal).toBe(false);

    await simpanPeringkat(QUIZ, ["a", "b"]);
    const sesudah = await bacaPeringkat<string[]>(QUIZ);
    expect(sesudah.kenal).toBe(true);
    expect(sesudah.nilai).toEqual(["a", "b"]);
  });

  it("invalidasi menaikkan versi sehingga entri lama tak terbaca", async () => {
    await simpanPeringkat(QUIZ, ["lama"]);
    await nonaktifkanPeringkat(QUIZ);

    const sesudah = await bacaPeringkat<string[]>(QUIZ);
    expect(sesudah.kenal).toBe(false);

    await simpanPeringkat(QUIZ, ["baru"]);
    const terbaru = await bacaPeringkat<string[]>(QUIZ);
    expect(terbaru.nilai).toEqual(["baru"]);
  });

  it("saklar mati selalu jatuh ke DB walau cache terisi", async () => {
    await simpanPeringkat(QUIZ, ["tersimpan"]);
    const denganMati = await bacaPeringkat<string[]>(QUIZ, { mati: true });
    expect(denganMati.kenal).toBe(false);

    // Penulisan juga harus dinonaktifkan saat mati.
    await simpanPeringkat(QUIZ, ["gagal-tulis"], { mati: true });
    const normal = await bacaPeringkat<string[]>(QUIZ);
    expect(normal.nilai).toEqual(["tersimpan"]);
  });
});