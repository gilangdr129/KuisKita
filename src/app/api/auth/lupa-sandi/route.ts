import { ok } from "@/lib/http/response";
import { parseOrFail } from "@/lib/http/validate";
import { AUTH_RATE_LIMIT, checkRateLimit } from "@/lib/security/ratelimit";
import { createUserClient } from "@/lib/supabase/server";
import { forgotPasswordSchema } from "@/lib/validation/schemas";

/**
 * POST /api/auth/lupa-sandi — kirim tautan reset password.
 * Selalu balas sukses generik (tidak membocorkan apakah email terdaftar).
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "ip-tak-dikenal";
  const rate = await checkRateLimit(`lupa-sandi:${ip}`, AUTH_RATE_LIMIT.max);
  if (!rate.success) {
    return ok(request, { sent: true });
  }

  const parsed = parseOrFail(request, forgotPasswordSchema, await request.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const { email } = parsed.data;
  const origin = new URL(request.url).origin;
  const supabase = await createUserClient();

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/perbarui-sandi`,
  });

  return ok(request, { sent: true });
}
