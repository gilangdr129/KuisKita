import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Profil",
};

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
    .select("username, avatar_url, role")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-4 py-12">
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
            <span className="text-slate-500 dark:text-slate-400">Status email</span>
            <span className="font-medium">
              {user.email_confirmed_at ? "Terverifikasi" : "Belum diverifikasi"}
            </span>
          </div>
        </CardContent>
        <div className="mt-4">
          <LogoutButton />
        </div>
      </Card>
    </main>
  );
}
