import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDasbor, type AdminKuis, type AdminPengguna, type AdminLaporan } from "@/components/admin/admin-dasbor";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createUserClient, getServiceSupabase } from "@/lib/supabase/server";

export const instant = false;

export const metadata: Metadata = {
  title: "Admin",
  description: "Moderasi kuis, daftar pengguna, dan laporan (khusus admin).",
};

/** Halaman admin: daftar kuis/pengguna/laporan + pencarian dasar + suspend. */
export default async function AdminPage() {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/masuk?next=/admin");
  }

  const { data: profil } = await supabase
    .from("profiles")
    .select("username, role")
    .eq("id", user.id)
    .single();

  if (profil?.role !== "admin") {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Halaman khusus admin</CardTitle>
            <CardDescription>
              Akun Anda (@{profil?.username ?? "pengguna"}) tidak memiliki peran admin, sehingga
              tidak dapat membuka halaman moderasi ini.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const service = getServiceSupabase();

  const [{ data: kuis }, { data: pengguna }, { data: laporan }] = await Promise.all([
    service
      .from("quizzes")
      .select("id, judul, status, visibilitas, created_at, profiles ( username )")
      .order("created_at", { ascending: false })
      .limit(100),
    service.from("profiles").select("id, username, role, created_at").order("created_at", { ascending: false }).limit(100),
    service
      .from("reports")
      .select("id, alasan, status, created_at, quizzes ( judul ), profiles ( username )")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const daftarKuis: AdminKuis[] = (kuis ?? []).map((row) => ({
    id: String(row.id),
    judul: String(row.judul),
    status: String(row.status),
    visibilitas: String(row.visibilitas),
    created_at: String(row.created_at),
    pemilik: ((row.profiles as unknown as { username: string } | null)?.username ?? null),
  }));

  const daftarPengguna: AdminPengguna[] = (pengguna ?? []).map((row) => ({
    id: String(row.id),
    username: String(row.username),
    role: String(row.role),
    created_at: String(row.created_at),
  }));

  const daftarLaporan: AdminLaporan[] = (laporan ?? []).map((row) => ({
    id: String(row.id),
    alasan: String(row.alasan),
    status: String(row.status),
    created_at: String(row.created_at),
    kuis_judul: ((row.quizzes as unknown as { judul: string } | null)?.judul ?? null),
    pelapor: ((row.profiles as unknown as { username: string } | null)?.username ?? null),
  }));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Moderasi kuis (suspend + audit + notifikasi), daftar pengguna, dan laporan masuk.
        </p>
      </div>

      <AdminDasbor
        kuis={daftarKuis}
        pengguna={daftarPengguna}
        laporan={daftarLaporan}
      />
    </main>
  );
}