import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { ProfilForm } from "@/components/auth/profil-form";
import { AvatarUpload } from "@/components/profil/avatar-upload";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Profil",
};

function formatTanggal(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(iso));
}

export default async function ProfilPage() {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/masuk?next=/profil");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, avatar_url, role, created_at")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-4 px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Profil Anda</CardTitle>
          <CardDescription>Data akun KuisKita</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Email</span>
            <span className="font-medium">{user.email}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Username</span>
            <span className="font-medium">{profile?.username ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Peran</span>
            <span className="font-medium">{profile?.role ?? "player"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Bergabung</span>
            <span className="font-medium">{formatTanggal(profile?.created_at ?? null)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500 dark:text-slate-400">Status email</span>
            <span className="font-medium">
              {user.email_confirmed_at ? "Terverifikasi" : "Belum diverifikasi"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ubah username</CardTitle>
          <CardDescription>
            Username tampil di papan peringkat. Gunakan 3-20 karakter: huruf kecil, angka, titik,
            underscore. Nama sama dengan beda kapital tetap dianggap kembar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfilForm usernameSekarang={profile?.username ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avatar</CardTitle>
          <CardDescription>Gambar ini tampil di papan peringkat dan daftar kuis.</CardDescription>
        </CardHeader>
        <CardContent>
          <AvatarUpload avatarUrl={profile?.avatar_url ?? null} />
        </CardContent>
      </Card>

      <LogoutButton />
    </main>
  );
}
