import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tes rate limit (Gate F18): batas terlampaui → 429 + Retry-After,
 * Upstash mati/tanpa env → fail-open (request tetap dilayani).
 */

let hasilLimit: { success: boolean; reset: number } = { success: true, reset: Date.now() + 60_000 };
let lemparError = false;
let redisAda = true;

vi.mock("@upstash/ratelimit", () => {
  class RatelimitPalsu {
    static slidingWindow(limit: number, window: string) {
      return { limit, window };
    }
    async limit(_key: string) {
      if (lemparError) throw new Error("redis tidak dapat dihubungi");
      return hasilLimit;
    }
  }
  return { Ratelimit: RatelimitPalsu };
});

vi.mock("@/lib/leaderboard/redis", () => ({
  ambilRedis: () => (redisAda ? { id: "redis-palsu" } : null),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://contoh.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "kunci-anon-uji-yang-cukup-panjang";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "kunci-service-uji-yang-cukup-panjang";

const { checkRateLimit, batasi, responsRateLimit } = await import("@/lib/security/ratelimit");

describe("rate limit (F18)", () => {
  beforeEach(() => {
    hasilLimit = { success: true, reset: Date.now() + 60_000 };
    lemparError = false;
    redisAda = true;
  });

  it("di bawah batas → lolos", async () => {
    const hasil = await checkRateLimit("uji:kunci", 5);
    expect(hasil.success).toBe(true);
  });

  it("melewati batas → pesan ramah + retryAfter", async () => {
    hasilLimit = { success: false, reset: Date.now() + 30_000 };
    const hasil = await checkRateLimit("uji:kunci", 5);
    expect(hasil.success).toBe(false);
    expect(hasil.reason).toContain("detik");
    expect(hasil.retryAfter).toBeGreaterThan(0);
  });

  it("Redis melempar error → fail-open (tetap lolos)", async () => {
    lemparError = true;
    const hasil = await checkRateLimit("uji:kunci", 5);
    expect(hasil.success).toBe(true);
  });

  it("tanpa Redis (env kosong) → fail-open", async () => {
    redisAda = false;
    const hasil = await checkRateLimit("uji:kunci", 5);
    expect(hasil.success).toBe(true);
  });

  it("responsRateLimit menghasilkan 429 + header Retry-After", async () => {
    hasilLimit = { success: false, reset: Date.now() + 30_000 };
    const hasil = await checkRateLimit("uji:kunci", 5);
    const respons = responsRateLimit(new Request("http://localhost/api/uji"), hasil);
    expect(respons.status).toBe(429);
    expect(respons.headers.get("retry-after")).toBe(String(hasil.retryAfter));
    const body = (await respons.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe("RATE_LIMITED");
  });

  it("batasi: null saat lolos, respons 429 saat terlampaui", async () => {
    const request = new Request("http://localhost/api/uji");
    expect(await batasi(request, "uji:kunci", 5)).toBeNull();

    hasilLimit = { success: false, reset: Date.now() + 30_000 };
    const respons = await batasi(request, "uji:kunci", 5);
    expect(respons?.status).toBe(429);
  });
});