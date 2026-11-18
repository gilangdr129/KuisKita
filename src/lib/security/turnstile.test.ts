import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tes verifikasi Turnstile (Gate F18): fail-closed bila secret dikonfigurasi;
 * mode nonaktif (lolos) hanya bila secret tidak diisi (dev).
 */

const fetchAsli = globalThis.fetch;
let hasilFetch: { ok: boolean; json: () => Promise<unknown> } | Error = {
  ok: true,
  json: async () => ({ success: true }),
};

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://contoh.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "kunci-anon-uji-yang-cukup-panjang";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "kunci-service-uji-yang-cukup-panjang";

const { verifikasiTurnstile } = await import("@/lib/security/turnstile");

describe("verifikasi Turnstile (F18)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async () => {
      if (hasilFetch instanceof Error) throw hasilFetch;
      return hasilFetch;
    });
    hasilFetch = { ok: true, json: async () => ({ success: true }) };
  });

  afterEach(() => {
    vi.stubGlobal("fetch", fetchAsli);
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it("tanpa secret → mode nonaktif (lolos untuk dev)", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const hasil = await verifikasiTurnstile(undefined, "127.0.0.1");
    expect(hasil).toEqual({ ok: true, mode: "nonaktif" });
  });

  it("dengan secret tapi token kosong → TURNSTILE_REQUIRED", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret-uji";
    const hasil = await verifikasiTurnstile(undefined, "127.0.0.1");
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.code).toBe("TURNSTILE_REQUIRED");
  });

  it("Cloudflare menerima → lolos (mode aktif)", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret-uji";
    const hasil = await verifikasiTurnstile("token-valid", "127.0.0.1");
    expect(hasil).toEqual({ ok: true, mode: "aktif" });
  });

  it("Cloudflare menolak → TURNSTILE_FAILED (fail-closed)", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret-uji";
    hasilFetch = { ok: true, json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }) };
    const hasil = await verifikasiTurnstile("token-jelek", "127.0.0.1");
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.code).toBe("TURNSTILE_FAILED");
  });

  it("Cloudflare tidak dapat dihubungi → TURNSTILE_FAILED (bukan lolos)", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret-uji";
    hasilFetch = new Error("jaringan putus");
    const hasil = await verifikasiTurnstile("token-valid", "127.0.0.1");
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) expect(hasil.code).toBe("TURNSTILE_FAILED");
  });
});