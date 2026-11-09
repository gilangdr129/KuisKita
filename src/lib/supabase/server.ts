import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getPublicEnv, getServerEnv } from "@/lib/env";

/**
 * Klien Supabase ter-sesi untuk Route Handlers / Server Actions /
 * Server Components. Berjalan sebagai pengguna yang login, sehingga RLS aktif
 * penuh. Cookie sesi bersifat httpOnly (dikelola @supabase/ssr).
 */
export async function createUserClient(): Promise<SupabaseClient> {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value }) => cookieStore.set(name, value));
        } catch {
          // Server Components tidak boleh menulis cookie; refresh sesi
          // ditangani middleware. Aman diabaikan di sini.
        }
      },
    },
  });
}

/**
 * Klien Supabase dengan service role. HANYA untuk kode server (Route Handlers,
 * cron, RPC penilaian). Jangan pernah diimpor dari komponen klien.
 */
let cachedServiceClient: SupabaseClient | null = null;

export function getServiceSupabase(): SupabaseClient {
  if (!cachedServiceClient) {
    const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
    const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();
    cachedServiceClient = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedServiceClient;
}
