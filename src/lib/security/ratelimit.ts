import { Ratelimit } from "@upstash/ratelimit";
import { fail } from "@/lib/http/response";
import { ambilRedis } from "@/lib/leaderboard/redis";

/**
 * Rate limit (PRD §16, Gate F18) — Upstash sliding window.
 *
 * Batas default (bisa ditimpa pemanggil):
 *   login/daftar/reset  5/menit/IP   · attempt 10/menit/user
 *   answers 60/menit/user            · submit 5/menit/user
 *   upload 20/jam/user               · API publik 100/menit/IP
 *
 * D9: kegagalan Upstash (jaringan/env belum diisi) selalu FAIL-OPEN — request
 * tetap dilayani dan kejadian dicatat (`RATE_LIMIT_FAIL_OPEN`). Rate limit
 * bukan alasan untuk mematikan aplikasi.
 */

export type RateLimitResult = {
  success: boolean;
  reason?: string;
  /** Detik hingga jendela berikutnya (dipakai header Retry-After). */
  retryAfter?: number;
};

export const AUTH_RATE_LIMIT = { max: 5, windowSeconds: 60 } as const;
export const ATTEMPT_RATE_LIMIT = { max: 10, windowSeconds: 60 } as const;
export const ANSWERS_RATE_LIMIT = { max: 60, windowSeconds: 60 } as const;
export const SUBMIT_RATE_LIMIT = { max: 5, windowSeconds: 60 } as const;
export const UPLOAD_RATE_LIMIT = { max: 20, windowSeconds: 3600 } as const;
export const PUBLIC_API_RATE_LIMIT = { max: 100, windowSeconds: 60 } as const;

/** IP klien untuk kunci rate limit (header proxy Vercel). */
export function ipKlien(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "ip-tak-dikenal";
}

let peringatanNonaktif = false;

/**
 * Periksa rate limit untuk sebuah kunci. Mengembalikan success=false +
 * pesan ramah + retryAfter saat batas terlampaui.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number = 60,
): Promise<RateLimitResult> {
  const redis = ambilRedis();

  if (!redis) {
    if (!peringatanNonaktif) {
      peringatanNonaktif = true;
      console.warn("RATE_LIMIT_FAIL_OPEN: Upstash belum dikonfigurasi — semua request lolos");
    }
    return { success: true };
  }

  try {
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds}s`),
      analytics: false,
      prefix: "kuiskita-ratelimit",
    });

    const hasil = await limiter.limit(key);
    if (!hasil.success) {
      // reset diterima sebagai detik atau milidetik tergantung versi SDK.
      const resetMs = hasil.reset > 1e12 ? hasil.reset : hasil.reset * 1000;
      const retryAfter = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
      return {
        success: false,
        reason: `Terlalu banyak percobaan. Coba lagi dalam ${retryAfter} detik.`,
        retryAfter,
      };
    }
    return { success: true };
  } catch (error) {
    console.error("RATE_LIMIT_FAIL_OPEN", { key, error });
    return { success: true };
  }
}

/** Respons 429 seragam: envelope ramah + header Retry-After. */
export function responsRateLimit(request: Request, hasil: RateLimitResult) {
  const res = fail(
    request,
    429,
    "RATE_LIMITED",
    hasil.reason ?? "Terlalu banyak percobaan. Coba lagi nanti.",
  );
  if (hasil.retryAfter) {
    res.headers.set("retry-after", String(hasil.retryAfter));
  }
  return res;
}

/** Pola pemakaian di route: `const batas = await batasi(...); if (batas) return batas;` */
export async function batasi(
  request: Request,
  key: string,
  limit: number,
  windowSeconds: number = 60,
) {
  const hasil = await checkRateLimit(key, limit, windowSeconds);
  return hasil.success ? null : responsRateLimit(request, hasil);
}