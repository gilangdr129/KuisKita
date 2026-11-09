import type { NextRequest } from "next/server";
import { NextRequest as NextRequestClass } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tes guard middleware. Session refresh sengaja gagal (env dummy) sehingga
 * middleware diperlakukan sebagai pengguna belum login — perilaku fail-closed.
 */

async function getMiddleware() {
  return (await import("./middleware")).middleware;
}

function req(pathname: string) {
  return new NextRequestClass(new URL(pathname, "http://localhost"));
}

describe("middleware guard route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("mengarahkan halaman terproteksi ke /masuk?next=", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dummyproject.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", `sb_publishable_${"x".repeat(20)}`);

    const middleware = await getMiddleware();
    const response = await middleware(req("/riwayat") as NextRequest);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/masuk?next=%2Friwayat");
  });

  it("menolak endpoint API terproteksi dengan 401 envelope", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dummyproject.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", `sb_publishable_${"x".repeat(20)}`);

    const middleware = await getMiddleware();
    const response = await middleware(req("/api/me/attempts") as NextRequest);

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("melewatkan endpoint API publik", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dummyproject.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", `sb_publishable_${"x".repeat(20)}`);

    const middleware = await getMiddleware();
    const response = await middleware(req("/api/health") as NextRequest);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("melewatkan halaman publik", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dummyproject.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", `sb_publishable_${"x".repeat(20)}`);

    const middleware = await getMiddleware();
    const response = await middleware(req("/") as NextRequest);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
