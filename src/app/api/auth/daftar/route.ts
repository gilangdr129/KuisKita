import { fail, ok } from "@/lib/http/response";
import { mapAuthError } from "@/lib/http/auth-errors";
import { parseOrFail } from "@/lib/http/validate";
import { AUTH_RATE_LIMIT, checkRateLimit } from "@/lib/security/ratelimit";
import { createUserClient } from "@/lib/supabase/server";
import { signUpSchema } from "@/lib/validation/schemas";

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "ip-tak-dikenal";
}

function originOf(request: Request) {
  return new URL(request.url).origin;
}

/** POST /api/auth/daftar — buat akun baru (email + password + username). */
export async function POST(request: Request) {
  const rate = await checkRateLimit(`daftar:${clientIp(request)}`, AUTH_RATE_LIMIT.max);
  if (!rate.success) {
    return fail(request, 429, "RATE_LIMITED", rate.reason ?? "Terlalu banyak percobaan. Coba lagi nanti.");
  }

  const parsed = parseOrFail(request, signUpSchema, await request.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const { email, username, password, turnstile_token } = parsed.data;
  void turnstile_token; // dipasang penuh di F18

  const supabase = await createUserClient();

  // Pre-cek username: kolom username dapat dibaca publik (grant terbatas),
  // sehingga pengecekan bisa lewat klien ter-sesi sebelum signUp. Trigger
  // profiles tetap menjadi penjaga terakhir untuk kondisi balapan (race).
  const { data: usernameAda } = await supabase
    .from("profiles")
    .select("username")
    .eq("username", username)
    .maybeSingle();

  if (usernameAda) {
    return fail(request, 409, "USERNAME_TAKEN", "Username sudah dipakai. Pilih username lain.");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username },
      emailRedirectTo: `${originOf(request)}/auth/callback?next=/`,
    },
  });

  if (error) {
    const mapped = mapAuthError(error);
    return fail(request, mapped.status, mapped.code, mapped.message);
  }

  return ok(
    request,
    {
      id: data.user?.id,
      email: data.user?.email,
      needs_email_verification: !data.user?.email_confirmed_at,
      // Supabase langsung membuat sesi bila verifikasi email tidak diwajibkan
      // (setelan "Confirm email" di dashboard bisa berubah kapan saja).
      session_aktif: Boolean(data.session),
    },
    { status: 201 },
  );
}
