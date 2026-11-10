import type { NextRequest } from "next/server";
import { NextRequest as NextRequestClass } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Tes guard route (proxy.ts, konvensi Next 16). Session refresh sengaja gagal
 * (env dummy) sehingga proxy memperlakukan pengguna sebagai belum login —
 * perilaku fail-closed.
 */

async function getProxy() {
  return (await import("./proxy")).proxy;
}

function req(pathname: string) {
  return new NextRequestClass(new URL(pathname, "http://localhost"));
}

describe("proxy guard route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("mengarahkan halaman terproteksi ke /masuk?next=", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dummyproject.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", `sb_publishable_${"x".repeat(20)}`);

    const proxy = await getProxy();
    const response = await proxy(req("/riwayat") as NextRequest);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/masuk?next=%2Friwayat");
  });

  it("mengarahkan halaman perbarui-sandi ke /masuk", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dummyproject.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", `sb_publishable_${"x".repeat(20)}`);

    const proxy = await getProxy();
    const response = await proxy(req("/perbarui-sandi") as NextRequest);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/masuk?next=%2Fperbarui-sandi");
  });

  it("menolak endpoint API terproteksi dengan 401 envelope", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dummyproject.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", `sb_publishable_${"x".repeat(20)}`);

    const proxy = await getProxy();
    const response = await proxy(req("/api/me/attempts") as NextRequest);

    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("melewatkan endpoint API publik", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dummyproject.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", `sb_publishable_${"x".repeat(20)}`);

    const proxy = await getProxy();
    const response = await proxy(req("/api/health") as NextRequest);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("melewatkan halaman publik", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://dummyproject.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", `sb_publishable_${"x".repeat(20)}`);

    const proxy = await getProxy();
    const response = await proxy(req("/") as NextRequest);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
