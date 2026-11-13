import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

const fitur = [
  {
    judul: "Cepat di HP",
    isi: "Halaman ringan, satu soal per layar, dan hemat kuota.",
  },
  {
    judul: "Adil",
    isi: "Skor dan timer dihitung sepenuhnya di server, tidak bisa dimanipulasi dari browser.",
  },
  {
    judul: "Mudah dibuat",
    isi: "Editor sederhana untuk guru dan kreator komunitas, terbit dalam hitungan menit.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
          Fase 2 · Kerangka aplikasi aktif
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">KuisKita</h1>
        <p className="text-lg text-slate-600 dark:text-slate-300">
          Platform kuis berbahasa Indonesia tempat siapa pun dapat mengerjakan kuis, membuat kuis,
          dan bersaing di papan peringkat.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {fitur.map((item) => (
          <Card key={item.judul}>
            <CardTitle>{item.judul}</CardTitle>
            <CardDescription className="mt-1">{item.isi}</CardDescription>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button href="/kuis">Lihat katalog kuis</Button>
        <Button href="/masuk" variant="secondary">
          Masuk
        </Button>
        <Button href="/api/health" variant="ghost">
          Cek kesehatan API
        </Button>
      </div>
    </main>
  );
}
