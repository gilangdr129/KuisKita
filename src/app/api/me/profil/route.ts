import { fail, ok } from "@/lib/http/response";
import { parseOrFail } from "@/lib/http/validate";
import { createUserClient } from "@/lib/supabase/server";
import { updateUsernameSchema } from "@/lib/validation/schemas";

/** PATCH /api/me/profil — ubah username sendiri (unik, milik sendiri via RLS). */
export async function PATCH(request: Request) {
  const parsed = parseOrFail(request, updateUsernameSchema, await request.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const { username } = parsed.data;
  const supabase = await createUserClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail(request, 401, "UNAUTHORIZED", "Anda harus masuk untuk mengubah profil.");
  }

  // Username lain boleh dibaca publik (grant kolom terbatas), cek dulu agar
  // pesan 409 rapi sebelum menulis.
  const { data: dipakai } = await supabase
    .from("profiles")
    .select("username")
    .eq("username", username)
    .maybeSingle();

  if (dipakai) {
    return fail(request, 409, "USERNAME_TAKEN", "Username sudah dipakai. Pilih username lain.");
  }

  const { error } = await supabase.from("profiles").update({ username }).eq("id", user.id);

  if (error) {
    return fail(request, 409, "USERNAME_TAKEN", "Username sudah dipakai. Pilih username lain.");
  }

  return ok(request, { username });
}
