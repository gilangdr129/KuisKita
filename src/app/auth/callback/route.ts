import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback — tujuan redirect tautan email Supabase (signup &
 * recovery). Menukar `code` menjadi sesi cookie httpOnly, lalu mengarahkan
 * ke `next` (default beranda).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL("/masuk?status=sesi_gagal", url.origin));
  }

  const supabase = await createUserClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/masuk?status=sesi_gagal&pesan=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
