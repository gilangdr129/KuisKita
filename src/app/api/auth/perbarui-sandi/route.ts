import { fail, ok } from "@/lib/http/response";
import { mapAuthError } from "@/lib/http/auth-errors";
import { parseOrFail } from "@/lib/http/validate";
import { createUserClient } from "@/lib/supabase/server";
import { updatePasswordSchema } from "@/lib/validation/schemas";

/** POST /api/auth/perbarui-sandi — setel password baru (butuh sesi recovery). */
export async function POST(request: Request) {
  const parsed = parseOrFail(request, updatePasswordSchema, await request.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const { password } = parsed.data;
  const supabase = await createUserClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    const mapped = mapAuthError(error);
    return fail(request, mapped.status, mapped.code, mapped.message);
  }

  return ok(request, { updated: true });
}
