import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MulaiKontrol } from "@/components/kuis/mulai-kontrol";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

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

/**
 * Halaman detail kuis (sementara, non-ISR). Soal & opsi dibaca lewat klien
 * ter-sesi sehingga RLS berlaku penuh: kuis draft hanya terlihat pemiliknya,
 * dan question_keys tidak pernah diminta (kunci jawaban tak pernah ke klien).
 */
export default async function KuisDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createUserClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, judul, deskripsi, kesulitan, durasi_detik, status, visibilitas, owner_id")
    .eq("id", id)
    .maybeSingle();

  if (!quiz) {
    notFound();
  }

  // Username kreator diambil terpisah: profiles sengaja hanya mengizinkan
  // SELECT kolom tertentu (username/avatar_url) untuk anon, sehingga embed
  // PostgREST (yang butuh hak SELECT tabel) tidak dipakai di sini.
  const { data: kreatorRow } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", quiz.owner_id)
    .maybeSingle();

  const { data: soal } = await supabase
    .from("questions")
    .select("id, teks, tipe, bobot, urutan, options ( id, teks, urutan )")
    .eq("quiz_id", id)
    .order("urutan", { ascending: true });

  const daftarSoal = soal ?? [];
  const kreator = kreatorRow as { username: string } | null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">
          {KESULITAN_LABEL[quiz.kesulitan] ?? quiz.kesulitan} · {formatDurasi(quiz.durasi_detik)}
        </p>
        <h1 className="text-3xl font-bold tracking-tight">{quiz.judul}</h1>
        <p className="text-slate-600 dark:text-slate-300">{quiz.deskripsi}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {daftarSoal.length} soal · dibuat oleh @{kreator?.username ?? "kuiskita"}
          {quiz.status !== "published" ? " · draf (hanya Anda yang melihat)" : ""}
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
          {user ? (
            <MulaiKontrol quizId={quiz.id} />
          ) : (
            <Button href={`/masuk?next=/kuis/${quiz.id}`}>Masuk untuk mulai</Button>
          )}
        </CardHeader>
      </Card>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Daftar soal</h2>
        {daftarSoal.length === 0 ? (
          <EmptyState
            title="Belum ada soal"
            description="Kuis ini belum memiliki soal yang terbit."
          />
        ) : (
          daftarSoal.map((item, index) => (
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
                {(item.options ?? [])
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
