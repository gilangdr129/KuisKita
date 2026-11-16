import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KuisAksi } from "@/components/dasbor/kuis-aksi";
import { StatusBadge } from "@/components/kuis/status-badge";
import { KuisForm, type KategoriOpsi } from "@/components/kuis/kuis-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KUIS_SELECT } from "@/lib/creator/kuis";
import { ambilAksesDasbor, ambilKategoriOpsi } from "@/lib/dasbor/akses";
import { createUserClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/schemas";

export const instant = false;

export const metadata: Metadata = {
  title: "Edit kuis",
  description: "Ubah metadata kuis milik Anda atau tangguhkan kuis.",
};

type Props = {
  params: Promise<{ id: string }>;
};

/** Halaman edit metadata kuis milik sendiri (orang lain → 404). */
export default async function EditKuisPage({ params }: Props) {
  const { id } = await params;
  const idValid = uuidSchema.safeParse(id);
  if (!idValid.success) {
    notFound();
  }

  const akses = await ambilAksesDasbor(`/dasbor/kuis/${id}/edit`);
  const supabase = await createUserClient();

  const { data } = await supabase
    .from("quizzes")
    .select(KUIS_SELECT)
    .eq("id", idValid.data)
    .eq("owner_id", akses.userId)
    .maybeSingle();

  // Baris hasil select belum bertipe (klien Supabase tanpa generated types).
  const kuis = (data ?? null) as unknown as Record<string, unknown> | null;
  if (!kuis) {
    notFound();
  }

  const kategoriOpsi: KategoriOpsi[] = await ambilKategoriOpsi(supabase);

  const kuisAwal = {
    id: String(kuis.id),
    judul: String(kuis.judul),
    deskripsi: (kuis.deskripsi as string | null) ?? null,
    // Nilai dijamin oleh check constraint database.
    kesulitan: String(kuis.kesulitan) as "easy" | "medium" | "hard",
    durasi_detik: Number(kuis.durasi_detik),
    visibilitas: String(kuis.visibilitas) as "public" | "unlisted" | "private",
    acak_soal: Boolean(kuis.acak_soal),
    acak_opsi: Boolean(kuis.acak_opsi),
    maks_percobaan: kuis.maks_percobaan == null ? null : Number(kuis.maks_percobaan),
    kategori: { slug: ((kuis.categories as { slug: string | null } | null)?.slug ?? null) },
    status: String(kuis.status),
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Edit kuis</h1>
          <StatusBadge status={kuisAwal.status} />
        </div>
        <p className="text-slate-600 dark:text-slate-300">
          {kuisAwal.status === "draft"
            ? "Kuis masih draf — perubahan hanya terlihat oleh Anda."
            : "Perubahan metadata langsung memperbarui halaman kuis yang sudah terbit."}
        </p>
      </div>

      <Card>
        <KuisForm mode="edit" kategoriOpsi={kategoriOpsi} kuisAwal={kuisAwal} />
      </Card>

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">Soal & kunci jawaban</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Kelola soal, opsi, kunci jawaban, dan gambar pada editor soal. Penerbitan menyusul
              setelah kuis memiliki soal lengkap.
            </p>
          </div>
          <Button href={`/dasbor/kuis/${kuisAwal.id}/soal`}>Editor soal</Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">Hapus atau tangguhkan</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {kuisAwal.status === "draft"
                ? "Draf dihapus permanen."
                : "Kuis terbit/tangguh hanya ditangguhkan dan disembunyikan dari publik."}
            </p>
          </div>
          <KuisAksi id={kuisAwal.id} judul={kuisAwal.judul} status={kuisAwal.status} />
        </div>
      </Card>
    </main>
  );
}