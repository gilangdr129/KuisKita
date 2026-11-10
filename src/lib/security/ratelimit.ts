/**
 * Stub rate limit (F18). Saat ini selalu lolos; jalur pemanggilan sudah
 * dipasang di endpoint sensitif (auth) supaya penggantian ke Upstash di F18
 * hanya menyentuh berkas ini, bukan semua route handler.
 *
 * Batas awal (PRD §16): login/daftar/reset 5-10 per menit per IP.
 */

export type RateLimitResult = {
  success: boolean;
  reason?: string;
};

const WINDOW_SECONDS = 60;

export async function checkRateLimit(
  _key: string,
  _limit: number,
  _windowSeconds: number = WINDOW_SECONDS,
): Promise<RateLimitResult> {
  // TODO F18: ganti dengan @upstash/ratelimit (Ratelimit.slidingWindow).
  // Fail-open sekarang agar pengembangan lokal tidak terhalang.
  return { success: true };
}

export const AUTH_RATE_LIMIT = {
  /** Percobaan masuk/daftar/reset per menit per IP (PRD §16). */
  max: 5,
  windowSeconds: WINDOW_SECONDS,
};
