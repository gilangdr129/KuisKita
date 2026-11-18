import { getServerEnv } from "@/lib/env";

export type HasilTurnstile =
  | { ok: true; mode: "aktif" | "nonaktif" }
  | { ok: false; code: string; message: string };

/**
 * Verifikasi Cloudflare Turnstile (Gate F18) — FAIL-CLOSED.
 *
 * Bila `TURNSTILE_SECRET_KEY` diisi, token wajib ada dan harus valid menurut
 * Cloudflare; token kosong/invalid/gagal diverifikasi = request ditolak.
 * Tanpa secret (dev lokal tanpa widget), verifikasi dilewati (mode nonaktif).
 *
 * Untuk uji lokal tersedia kunci uji resmi Cloudflare (lihat .env.example):
 * selalu-lolos `1x0000000000000000000000000000000AA`, selalu-gagal
 * `2x0000000000000000000000000000000AA`.
 */
export async function verifikasiTurnstile(
  token: string | null | undefined,
  ip: string,
): Promise<HasilTurnstile> {
  const env = getServerEnv();
  const secret = env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    return { ok: true, mode: "nonaktif" };
  }

  if (!token) {
    return {
      ok: false,
      code: "TURNSTILE_REQUIRED",
      message: "Verifikasi keamanan (Turnstile) wajib diisi sebelum melanjutkan.",
    };
  }

  try {
    const respons = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        ...(ip && ip !== "ip-tak-dikenal" ? { remoteip: ip } : {}),
      }),
    });

    const data = (await respons.json().catch(() => ({}))) as {
      success?: boolean;
      "error-codes"?: string[];
    };

    if (!respons.ok || data.success !== true) {
      return {
        ok: false,
        code: "TURNSTILE_FAILED",
        message: "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.",
      };
    }

    return { ok: true, mode: "aktif" };
  } catch {
    // Turnstile fail-closed: tak bisa memverifikasi = ditolak (bukan lolos).
    return {
      ok: false,
      code: "TURNSTILE_FAILED",
      message: "Verifikasi keamanan tidak dapat dihubungi. Coba lagi nanti.",
    };
  }
}