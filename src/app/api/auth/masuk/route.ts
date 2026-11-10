import { fail, ok } from "@/lib/http/response";
import { mapAuthError } from "@/lib/http/auth-errors";
import { parseOrFail } from "@/lib/http/validate";
import { AUTH_RATE_LIMIT, checkRateLimit } from "@/lib/security/ratelimit";
import { createUserClient } from "@/lib/supabase/server";
import { signInSchema } from "@/lib/validation/schemas";

/** POST /api/auth/masuk — login email + password, set cookie sesi httpOnly. */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "ip-tak-dikenal";
  const rate = await checkRateLimit(`masuk:${ip}`, AUTH_RATE_LIMIT.max);
  if (!rate.success) {
    return fail(request, 429, "RATE_LIMITED", rate.reason ?? "Terlalu banyak percobaan. Coba lagi nanti.");
  }

  const parsed = parseOrFail(request, signInSchema, await request.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const { email, password } = parsed.data;
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const mapped = mapAuthError(error);
    return fail(request, mapped.status, mapped.code, mapped.message);
  }

  return ok(request, { id: data.user.id, email: data.user.email });
}
