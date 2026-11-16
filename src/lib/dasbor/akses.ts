import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createUserClient } from "@/lib/supabase/server";

export type AksesDasbor = {
  userId: string;
  role: string;
  username: string | null;
};

/**
 * Sesi + peran kreator untuk halaman dasbor. Fungsi ini melakukan redirect
 * sendiri: belum masuk → halaman masuk dengan `next`, peran pemain → /dasbor
 * (yang menjelaskan situasinya).
 */
export async function ambilAksesDasbor(next: string): Promise<AksesDasbor> {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/masuk?next=${encodeURIComponent(next)}`);
  }

  const { data: profil } = await supabase
    .from("profiles")
    .select("username, role")
    .eq("id", user.id)
    .single();

  const role = profil?.role ?? "player";
  if (role !== "creator" && role !== "admin") {
    redirect("/dasbor");
  }

  return { userId: user.id, role, username: profil?.username ?? null };
}

export type KategoriOpsi = { slug: string; nama: string };

/** Daftar kategori untuk dropdown form kuis. */
export async function ambilKategoriOpsi(supabase: SupabaseClient): Promise<KategoriOpsi[]> {
  const { data } = await supabase.from("categories").select("slug, nama").order("nama");
  return (data ?? []).map((row) => ({ slug: String(row.slug), nama: String(row.nama) }));
}