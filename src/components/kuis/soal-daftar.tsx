import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export type SoalTampil = {
  id: string;
  teks: string;
  tipe: string;
  bobot: number;
  urutan: number;
  gambar_url: string | null;
  opsi: { id: string; teks: string; urutan: number }[];
};

/** Daftar soal + opsi (tanpa kunci jawaban) untuk halaman detail & pratinjau. */
export function SoalDaftar({ soal, pesanKosong }: { soal: SoalTampil[]; pesanKosong: string }) {
  if (soal.length === 0) {
    return <EmptyState title="Belum ada soal" description={pesanKosong} />;
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Daftar soal</h2>
      {soal.map((item, index) => (
        <Card key={item.id}>
          <CardHeader>
            <CardTitle className="text-base">
              {index + 1}. {item.teks}
            </CardTitle>
            <CardDescription>
              {item.tipe === "boolean" ? "Benar / salah" : "Pilihan ganda"} · bobot {item.bobot}
            </CardDescription>
          </CardHeader>
          {item.gambar_url ? (
            // Gambar soal diunggah lewat endpoint F5 (bucket media-kuis, publik).
            // eslint-disable-next-line @next/next/no-img-element -- gambar dari Storage Supabase, cukup <img> biasa
            <img
              src={item.gambar_url}
              alt={`Gambar untuk soal ${index + 1}`}
              className="mt-3 max-h-72 rounded-lg border border-slate-200 object-contain dark:border-slate-800"
              loading="lazy"
            />
          ) : null}
          <ul className="mt-3 flex list-disc flex-col gap-1 pl-8 text-sm text-slate-700 dark:text-slate-300">
            {item.opsi.map((opsi) => (
              <li key={opsi.id}>{opsi.teks}</li>
            ))}
          </ul>
        </Card>
      ))}
    </section>
  );
}