import type { Metadata } from "next";
import { KuisForm, type KategoriOpsi } from "@/components/kuis/kuis-form";
import { Card } from "@/components/ui/card";
import { ambilAksesDasbor, ambilKategoriOpsi } from "@/lib/dasbor/akses";
import { createUserClient } from "@/lib/supabase/server";

export const instant = false;

export const metadata: Metadata = {
  title: "Buat kuis",
  description: "Buat kuis draf baru: judul, deskripsi, kategori, kesulitan, dan durasi.",
};

/** Halaman buat kuis draf (terbit menyusul di F14). */
export default async function BuatKuisPage() {
  const akses = await ambilAksesDasbor("/dasbor/kuis/baru");
  const supabase = await createUserClient();
  const kategoriOpsi: KategoriOpsi[] = await ambilKategoriOpsi(supabase);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Buat kuis</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Kuis disimpan sebagai draf. Setelah soal dan kunci jawaban ditambahkan, kuis dapat
          diterbitkan.
        </p>
      </div>

      <Card>
        <KuisForm mode="buat" kategoriOpsi={kategoriOpsi} />
      </Card>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Masuk sebagai @{akses.username ?? "kreator"}.
      </p>
    </main>
  );
}