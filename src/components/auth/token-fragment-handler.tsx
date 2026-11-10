"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Menangani tautan email bergaya implicit: Supabase mengarahkan ke Site URL
 * dengan token sesi di URL fragment (#access_token=...&type=signup|recovery).
 * Jalur PKCE (redirect ke /auth/callback?code=...) ditangani route terpisah;
 * komponen ini membuat aplikasi tetap benar untuk kedua jalur.
 */
export function TokenFragmentHandler() {
  const router = useRouter();
  const handled = React.useRef(false);

  React.useEffect(() => {
    if (handled.current) return;

    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");

    if (!accessToken || !refreshToken) return;
    handled.current = true;

    const supabase = createClient();
    void (async () => {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      window.history.replaceState(null, "", window.location.pathname);

      if (error) {
        router.replace("/masuk?status=sesi_gagal");
        return;
      }
      router.replace(type === "recovery" ? "/perbarui-sandi" : "/");
      router.refresh();
    })();
  }, [router]);

  return null;
}
