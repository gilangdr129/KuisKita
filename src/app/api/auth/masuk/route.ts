import { fail, ok } from "@/lib/http/response";
import { mapAuthError } from "@/lib/http/auth-errors";
import { parseOrFail } from "@/lib/http/validate";
import { AUTH_RATE_LIMIT, batasi, ipKlien } from "@/lib/security/ratelimit";
import { verifikasiTurnstile } from "@/lib/security/turnstile";
import { createUserClient } from "@/lib/supabase/server";
import { signInSchema } from "@/lib/validation/schemas";

/** POST /api/auth/masuk — login email + password, set cookie sesi httpOnly. */
export async function POST(request: Request) {
  const ip = ipKlien(request);
  const batas = await batasi(request, `masuk:${ip}`, AUTH_RATE_LIMIT.max);
  if (batas) return batas;

  const parsed = parseOrFail(request, signInSchema, await request.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  // Turnstile (F18): wajib & fail-closed bila secret dikonfigurasi.
  const turnstile = await verifikasiTurnstile(parsed.data.turnstile_token, ip);
  if (!turnstile.ok) {
    return fail(request, 400, turnstile.code, turnstile.message);
  }

  const { email, password } = parsed.data;
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const mapped = mapAuthError(error);
    return fail(request, mapped.status, mapped.code, mapped.message);
  }

  return ok(request, { id: data.user.id, email: data.user.email });
}
