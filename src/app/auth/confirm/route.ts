import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/server";

/**
 * GET /auth/confirm — untuk template email berbasis token_hash
 * (alternatif dari /auth/callback). Memverifikasi token lalu mengarahkan
 * ke `next` (default beranda).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") ?? "/";

  const validTypes = ["signup", "recovery", "magiclink", "email_change", "invite"] as const;
  if (!tokenHash || !type || !validTypes.includes(type as (typeof validTypes)[number])) {
    return NextResponse.redirect(new URL("/masuk?status=sesi_gagal", url.origin));
  }

  const supabase = await createUserClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as (typeof validTypes)[number],
  });

  if (error) {
    return NextResponse.redirect(
      new URL(`/masuk?status=sesi_gagal&pesan=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
