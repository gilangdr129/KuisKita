import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv, getServerEnv } from "@/lib/env";

/**
 * Klien Supabase dengan service role. Hanya untuk kode server (Route
 * Handlers/cron). Jangan pernah diimpor dari komponen klien.
 */
let cachedClient: SupabaseClient | null = null;

export function getServiceSupabase(): SupabaseClient {
  if (!cachedClient) {
    const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();
    const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
    cachedClient = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedClient;
}
