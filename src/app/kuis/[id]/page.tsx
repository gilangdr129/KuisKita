import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MulaiKontrol } from "@/components/kuis/mulai-kontrol";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ambilKuisDetail } from "@/lib/cache/katalog";

const KESULITAN_LABEL: Record<string, string> = {
  easy: "Mudah",
  medium: "Sedang",
  hard: "Sulit",
};

function formatDurasi(detik: number) {
  if (detik < 60) return `${detik} detik`;
  const menit = Math.round(detik / 60);
  return `${menit} menit`;
}

export const instant = false;

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * Detail kuis resmi (ISR, PRD FR-K5): deskripsi, jumlah soal, durasi,
 * kesulitan, kreator, skor tertinggi, dan daftar soal + opsi TANPA kunci.
 * Kuis non-publik (draft/suspended) tidak pernah dirender ke siapapun.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const kuis = await ambilKuisDetail(id);
  if (!kuis) return { title: "Kuis tidak ditemukan" };
  return { title: kuis.judul, description: kuis.deskripsi ?? undefined };
}

export default async function KuisDetailPage({ params }: Props) {
  const { id } = await params;
  const kuis = await ambilKuisDetail(id);

  if (!kuis) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
          {KESULITAN_LABEL[kuis.kesulitan] ?? kuis.kesulitan} · {formatDurasi(kuis.durasi_detik)}
        </p>
        <h1 className="text-3xl font-bold tracking-tight">{kuis.judul}</h1>
        <p className="text-slate-600 dark:text-slate-300">{kuis.deskripsi}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {kuis.soal.length} soal · dibuat oleh @{kuis.kreator_username ?? "kuiskita"}
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Siap mengerjakan?</CardTitle>
            <CardDescription>
              Skor dihitung di server. Sisa waktu tersimpan meski halaman dimuat ulang.
            </CardDescription>
          </div>
          <MulaiKontrol quizId={kuis.id} />
        </CardHeader>
      </Card>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Daftar soal</h2>
        {kuis.soal.length === 0 ? (
          <EmptyState
            title="Belum ada soal"
            description="Kuis ini belum memiliki soal yang terbit."
          />
        ) : (
          kuis.soal.map((item, index) => (
            <Card key={item.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {index + 1}. {item.teks}
                </CardTitle>
                <CardDescription>
                  {item.tipe === "boolean" ? "Benar / salah" : "Pilihan ganda"} · bobot {item.bobot}
                </CardDescription>
              </CardHeader>
              <ul className="mt-3 flex list-disc flex-col gap-1 pl-8 text-sm text-slate-700 dark:text-slate-300">
                {item.opsi
                  .slice()
                  .sort((a, b) => a.urutan - b.urutan)
                  .map((opsi) => (
                    <li key={opsi.id}>{opsi.teks}</li>
                  ))}
              </ul>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}