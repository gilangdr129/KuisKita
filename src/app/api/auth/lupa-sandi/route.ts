import { fail, ok } from "@/lib/http/response";
import { parseOrFail } from "@/lib/http/validate";
import { AUTH_RATE_LIMIT, batasi, ipKlien } from "@/lib/security/ratelimit";
import { verifikasiTurnstile } from "@/lib/security/turnstile";
import { createUserClient } from "@/lib/supabase/server";
import { forgotPasswordSchema } from "@/lib/validation/schemas";

/**
 * POST /api/auth/lupa-sandi — kirim tautan reset password.
 * Selalu balas sukses generik (tidak membocorkan apakah email terdaftar).
 */
export async function POST(request: Request) {
  const ip = ipKlien(request);
  const batas = await batasi(request, `lupa-sandi:${ip}`, AUTH_RATE_LIMIT.max);
  if (batas) return batas;

  const parsed = parseOrFail(request, forgotPasswordSchema, await request.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const turnstile = await verifikasiTurnstile(parsed.data.turnstile_token, ip);
  if (!turnstile.ok) {
    return fail(request, 400, turnstile.code, turnstile.message);
  }

  const { email } = parsed.data;
  const origin = new URL(request.url).origin;
  const supabase = await createUserClient();

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/perbarui-sandi`,
  });

  return ok(request, { sent: true });
}
