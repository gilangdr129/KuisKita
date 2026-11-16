import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { StatusBadge } from "@/components/kuis/status-badge";
import { SoalDaftar } from "@/components/kuis/soal-daftar";
import { MulaiKontrol } from "@/components/kuis/mulai-kontrol";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ambilPratinjau } from "@/lib/pratinjau";
import { createUserClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/schemas";

export const instant = false;

export const metadata: Metadata = {
  title: "Pratinjau kuis",
  description: "Pratinjau kuis draf milik Anda, persis seperti yang dilihat pemain.",
};

type Props = {
  params: Promise<{ token: string }>;
};

const KESULITAN_LABEL: Record<string, string> = {
  easy: "Mudah",
  medium: "Sedang",
  hard: "Sulit",
};

function formatDurasi(detik: number) {
  const menit = Math.round(detik / 60);
  return menit >= 60 ? `${Math.floor(menit / 60)} jam${menit % 60 ? ` ${menit % 60} menit` : ""}` : `${menit} menit`;
}

/**
 * Pratinjau draft: token 30 menit terikat kuis + pemilik. Halaman ini hanya
 * bisa dibuka pemilik (sesi dicocokkan dengan token) dan menampilkan kuis
 * persis seperti pemain akan melihatnya — termasuk gambar soal, tanpa kunci.
 */
export default async function PratinjauPage({ params }: Props) {
  const { token } = await params;
  const tokenValid = uuidSchema.safeParse(token);
  if (!tokenValid.success) {
    notFound();
  }

  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/masuk?next=/pratinjau/${token}`);
  }

  const data = await ambilPratinjau(tokenValid.data, user.id);
  if (!data) {
    notFound();
  }

  const { kuis, soal } = data;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <p
        role="status"
        className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
      >
        Pratinjau draf — hanya Anda yang bisa melihat halaman ini. Tautan berlaku 30 menit.
      </p>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
            {KESULITAN_LABEL[kuis.kesulitan] ?? kuis.kesulitan} · {formatDurasi(kuis.durasi_detik)}
          </p>
          <StatusBadge status={kuis.status} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{kuis.judul}</h1>
        <p className="text-slate-600 dark:text-slate-300">{kuis.deskripsi}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {soal.length} soal · dibuat oleh @{kuis.kreator_username ?? "kuiskita"}
          {kuis.kategori_nama ? ` · ${kuis.kategori_nama}` : ""}
        </p>
      </div>

      {kuis.status === "published" ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Kuis sudah terbit</CardTitle>
              <CardDescription>
                Kunci jawaban & penskoran aktif pada halaman pemain.
              </CardDescription>
            </div>
            <MulaiKontrol quizId={kuis.id} />
          </CardHeader>
        </Card>
      ) : null}

      <SoalDaftar soal={soal} pesanKosong="Kuis ini belum punya soal. Tambahkan soal di editor lebih dulu." />

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Kunci jawaban tidak ditampilkan di pratinjau.{" "}
        <Link href={`/dasbor/kuis/${kuis.id}/soal`} className="underline">
          Kembali ke editor soal
        </Link>
        {" · "}
        <Link href="/dasbor" className="underline">
          Dasbor
        </Link>
      </p>
      <div>
        <Button variant="ghost" size="sm" href={`/dasbor/kuis/${kuis.id}/edit`}>
          Edit metadata kuis
        </Button>
      </div>
    </main>
  );
}