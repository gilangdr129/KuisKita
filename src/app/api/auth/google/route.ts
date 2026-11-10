import { fail, ok } from "@/lib/http/response";
import { mapAuthError } from "@/lib/http/auth-errors";
import { createUserClient } from "@/lib/supabase/server";

/** POST /api/auth/google — mulai OAuth Google; balas URL redirect Supabase. */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const next =
    body && typeof body === "object" && "next" in body && typeof body.next === "string" && body.next.startsWith("/")
      ? body.next
      : "/";

  const origin = new URL(request.url).origin;
  const supabase = await createUserClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });

  if (error || !data.url) {
    const mapped = error
      ? mapAuthError(error)
      : { status: 500, code: "OAUTH_FAILED", message: "Gagal memulai masuk dengan Google." };
    return fail(request, mapped.status, mapped.code, mapped.message);
  }

  return ok(request, { url: data.url });
}
