"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { readError, type EnvelopeError } from "@/lib/http/client";

type Props = {
  id: string;
  judul: string;
  status: string;
};

/**
 * Aksi hapus/tangguhkan kuis dari dasbor. Draf = hapus permanen; status lain
 * = tangguhkan + privat (URL publik tetap ada). Konfirmasi dua langkah agar
 * tidak terhapus akibat salah klik.
 */
export function KuisAksi({ id, judul, status }: Props) {
  const router = useRouter();
  const [konfirmasi, setKonfirmasi] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);

  const draf = status === "draft";
  const label = draf ? "Hapus" : "Tangguhkan";

  const jalankan = async () => {
    setLoading(true);
    setGalat(null);

    const response = await fetch(`/api/creator/quizzes/${id}`, { method: "DELETE" });
    if (response.ok) {
      router.refresh();
      return;
    }

    const error = (await readError(response)) as EnvelopeError | null;
    setGalat(error?.error.message ?? "Gagal menjalankan aksi.");
    setLoading(false);
    setKonfirmasi(false);
  };

  if (!konfirmasi) {
    return (
      <Button variant={draf ? "danger" : "secondary"} size="sm" onClick={() => setKonfirmasi(true)}>
        {label}
      </Button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-600 dark:text-slate-300">
        {draf ? `Hapus permanen "${judul}"?` : `Tangguhkan "${judul}"? Kuis tidak lagi tampil publik.`}
      </span>
      <Button variant="danger" size="sm" loading={loading} onClick={() => void jalankan()}>
        Ya, {label.toLowerCase()}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setKonfirmasi(false)}>
        Batal
      </Button>
      {galat ? (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {galat}
        </span>
      ) : null}
    </span>
  );
}