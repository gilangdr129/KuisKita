import { type NextRequest, NextResponse } from "next/server";
import { copySessionCookies, fail } from "@/lib/http/response";
import { updateSession } from "@/lib/supabase/middleware";

/** Halaman yang butuh login (PRD §7). Publik = sisanya. */
const PROTECTED_PAGES = ["/profil", "/riwayat", "/dasbor", "/admin"] as const;

/** Endpoint API yang butuh login. Sisanya di /api diasumsikan publik
 *  (saat ini: /api/quizzes, /api/health, /api/cron). */
const PROTECTED_API = [
  "/api/me",
  "/api/creator",
  "/api/admin",
  "/api/attempts",
  "/api/uploads",
  "/api/reports",
] as const;

function isProtectedApi(pathname: string) {
  return PROTECTED_API.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Endpoint API publik yang tidak butuh sesi: dilewati tanpa refresh auth
 *  agar tetap cepat dan tidak bergantung pada ketersediaan Supabase Auth
 *  (mis. health check uptime monitor dan cron keep-alive). */
const PUBLIC_API_NO_SESSION = ["/api/quizzes", "/api/health", "/api/cron"] as const;

function isPublicApiNoSession(pathname: string) {
  return PUBLIC_API_NO_SESSION.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicApiNoSession(pathname)) {
    return NextResponse.next({ request });
  }

  let sessionResponse: NextResponse;
  let user: { id: string } | null = null;

  try {
    const result = await updateSession(request);
    sessionResponse = result.supabaseResponse;
    user = result.user;
  } catch {
    // Kegagalan refresh sesi (mis. env belum diset) diperlakukan sebagai
    // belum login: fail-closed untuk route terproteksi, publik tetap jalan.
    sessionResponse = NextResponse.next({ request });
  }

  if (!user) {
    if (isProtectedApi(pathname)) {
      const unauthorized = fail(
        request,
        401,
        "UNAUTHORIZED",
        "Anda harus masuk untuk mengakses sumber daya ini.",
      );
      return copySessionCookies(unauthorized, sessionResponse);
    }

    if (PROTECTED_PAGES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      const loginUrl = new URL("/masuk", request.url);
      loginUrl.searchParams.set("next", pathname);
      const redirect = NextResponse.redirect(loginUrl);
      return copySessionCookies(redirect, sessionResponse);
    }
  }

  return sessionResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|txt|woff2?)$).*)",
  ],
};
