/**
 * Stub Turnstile (F18). Cloudflare Turnstile dipasang penuh di F18 pada form
 * sensitif (masuk, daftar, reset). Saat ini komponen hanya menyiapkan slot
 * agar alur form dan validasi server tidak perlu diubah saat F18.
 */

export type TurnstileVerifyResult = {
  ok: boolean;
  reason?: string;
};

export async function verifyTurnstile(_token?: string): Promise<TurnstileVerifyResult> {
  // TODO F18: panggil siteverify Cloudflare dengan TURNSTILE_SECRET_KEY.
  // Fail-closed hanya di F18; sekarang selalu lolos (belum ada widget).
  return { ok: true };
}
