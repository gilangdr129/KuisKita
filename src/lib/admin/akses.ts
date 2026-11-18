import type { NextResponse } from "next/server";
import { fail } from "@/lib/http/response";
import { createUserClient } from "@/lib/supabase/server";

export type AksesAdmin = { ok: true; userId: string } | { ok: false; response: NextResponse };

/** Sesi + peran admin untuk route moderasi (401 belum login, 403 bukan admin). */
export async function ambilAdmin(request: Request): Promise<AksesAdmin> {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: fail(request, 401, "UNAUTHORIZED", "Anda harus masuk sebagai admin.") };
  }

  const { data: profil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profil?.role !== "admin") {
    return { ok: false, response: fail(request, 403, "FORBIDDEN", "Aksi ini khusus admin.") };
  }

  return { ok: true, userId: user.id };
}