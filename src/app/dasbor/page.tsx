import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KuisAksi } from "@/components/dasbor/kuis-aksi";
import { StatusBadge } from "@/components/kuis/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KUIS_SELECT, keKuisKreator, type KuisKreator } from "@/lib/creator/kuis";
import { createUserClient } from "@/lib/supabase/server";

export const instant = false;

export const metadata: Metadata = {
  title: "Dasbor kreator",
  description: "Kelola kuis milik Anda: buat draf, ubah metadata, hapus atau tangguhkan.",
};

type Props = {
  searchParams: Promise<{ sukses?: string }>;
};

function formatTanggal(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(iso));
}

function formatDurasi(detik: number) {
  const menit = Math.round(detik / 60);
  return menit >= 60 ? `${Math.floor(menit / 60)} jam ${menit % 60 ? `${menit % 60} menit` : ""}`.trim() : `${menit} menit`;
}

const KESULITAN_LABEL: Record<string, string> = {
  easy: "Mudah",
  medium: "Sedang",
  hard: "Sulit",
};

/** Dasbor kreator: ringkasan + daftar "Kuis saya" (hanya milik sendiri). */
export default async function DasborPage({ searchParams }: Props) {
  const { sukses } = await searchParams;

  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/masuk?next=/dasbor");
  }

  const { data: profil } = await supabase
    .from("profiles")
    .select("username, role")
    .eq("id", user.id)
    .single();

  const kreator = profil?.role === "creator" || profil?.role === "admin";

  const daftar: KuisKreator[] = [];
  if (kreator) {
    const { data } = await supabase
      .from("quizzes")
      .select(KUIS_SELECT)
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });
    daftar.push(...(data ?? []).map((row) => keKuisKreator(row as unknown as Record<string, unknown>)));
  }

  const totalSoal = daftar.reduce((jumlah, kuis) => jumlah + kuis.jumlah_soal, 0);
  const jumlahTerbit = daftar.filter((kuis) => kuis.status === "published").length;
  const jumlahDraf = daftar.filter((kuis) => kuis.status === "draft").length;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Dasbor kreator</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Kelola kuis milik Anda. Kuis baru selalu dibuat sebagai draf; penerbitan menyusul.
        </p>
      </div>

      {sukses === "dibuat" || sukses === "diperbarui" ? (
        <p
          role="status"
          className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
        >
          {sukses === "dibuat" ? "Kuis draf berhasil dibuat." : "Perubahan kuis tersimpan."}
        </p>
      ) : null}

      {kreator ? (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total kuis", nilai: daftar.length },
              { label: "Terbit", nilai: jumlahTerbit },
              { label: "Draf", nilai: jumlahDraf },
              { label: "Total soal", nilai: totalSoal },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800"
              >
                <dt className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</dt>
                <dd className="text-2xl font-bold tabular-nums">{stat.nilai}</dd>
              </div>
            ))}
          </dl>

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Kuis saya ({daftar.length})</h2>
            <Button href="/dasbor/kuis/baru">Buat kuis</Button>
          </div>

          {daftar.length === 0 ? (
            <EmptyState
              title="Belum ada kuis"
              description="Buat kuis draf pertama Anda, lalu tambahkan soal sebelum menerbitkan."
              action={<Button href="/dasbor/kuis/baru">Buat kuis</Button>}
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {daftar.map((kuis) => (
                <li key={kuis.id}>
                  <Card>
                    <CardHeader className="flex-row items-start justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <CardTitle className="text-base">{kuis.judul}</CardTitle>
                        <CardDescription>
                          {kuis.kategori?.nama ?? "Tanpa kategori"} ·{" "}
                          {KESULITAN_LABEL[kuis.kesulitan] ?? kuis.kesulitan} ·{" "}
                          {formatDurasi(kuis.durasi_detik)} · {kuis.jumlah_soal} soal
                          {kuis.maks_percobaan != null ? ` · maks ${kuis.maks_percobaan}×` : ""}
                        </CardDescription>
                      </div>
                      <StatusBadge status={kuis.status} />
                    </CardHeader>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button variant="secondary" size="sm" href={`/dasbor/kuis/${kuis.id}/edit`}>
                        Edit
                      </Button>
                      {kuis.status === "published" ? (
                        <Button variant="ghost" size="sm" href={`/kuis/${kuis.id}`}>
                          Lihat halaman kuis
                        </Button>
                      ) : null}
                      <KuisAksi id={kuis.id} judul={kuis.judul} status={kuis.status} />
                      <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                        Diperbarui {formatTanggal(kuis.updated_at)}
                      </span>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Akun Anda berperan pemain</CardTitle>
            <CardDescription>
              Hanya kreator yang dapat membuat dan mengelola kuis. Hubungi administrator bila Anda
              ingin akun dinaikkan menjadi kreator.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </main>
  );
}