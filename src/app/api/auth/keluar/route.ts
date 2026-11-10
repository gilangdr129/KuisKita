import { ok } from "@/lib/http/response";
import { createUserClient } from "@/lib/supabase/server";

/** POST /api/auth/keluar — hapus sesi (idempoten, aman walau belum login). */
export async function POST(request: Request) {
  const supabase = await createUserClient();
  await supabase.auth.signOut();
  return ok(request, { success: true });
}
