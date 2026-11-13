import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CobaLagi } from "@/components/percobaan/coba-lagi";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { mapRpcError } from "@/lib/attempts/errors";
import { attemptIdSchema } from "@/lib/validation/schemas";
import { createUserClient, getServiceSupabase } from "@/lib/supabase/server";


export const instant = false;

export const metadata: Metadata = {
  title: "Hasil kuis",
};

type Props = {
  params: Promise<{ id: string }>;
};

type OpsiHasil = { id: string; teks: string; urutan: number };
type SoalHasil = {
  id: string;
  teks: string;
  tipe: string;
  bobot: number;
  pembahasan: string;
  benar: boolean | null;
  opsi_terpilih_id: string | null;
  opsi_benar_id: string | null;
  opsi: OpsiHasil[];
};

function formatDurasi(durasiMs: number | null) {
  if (!durasiMs) return "—";
  const totalDetik = Math.round(durasiMs / 1000);
  const menit = Math.floor(totalDetik / 60);
  const detik = totalDetik % 60;
  return `${menit}m ${String(detik).padStart(2, "0")}s`;
}

/**
 * Halaman hasil + pembahasan. Hanya untuk pemilik percobaan yang sudah
 * disubmit; jawaban benar & pembahasan dibaca lewat RPC server (question_keys
 * tidak pernah diekspos ke klien).
 */
export default async function HasilKuisPage({ params }: Props) {
  const { id } = await params;
  const validation = attemptIdSchema.safeParse(id);
  if (!validation.success) {
    redirect("/");
  }

  const session = await createUserClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) {
    redirect(`/masuk?next=/percobaan/${id}/hasil`);
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("get_attempt_result", {
    p_attempt_id: validation.data,
    p_user_id: user.id,
  });

  if (error) {
    const mapped = mapRpcError(error);
    if (mapped.status === 403) {
      redirect(`/percobaan/${id}`); // belum submit → kembali ke ruang kuis
    }
    if (mapped.status === 404) {
      redirect("/");
    }
    throw new Error(mapped.message);
  }

  const hasil = data as {
    attempt: { quiz_id: string; status: string; submitted_at: string };
    ringkasan: {
      skor: number;
      persentase: number;
      benar: number;
      salah: number;
      total_soal: number;
      durasi_ms: number | null;
      status: string;
      submitted_at: string;
    };
    soal: SoalHasil[];
  };

  const { ringkasan } = hasil;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Hasil kuis</h1>
        <p className="text-slate-600 dark:text-slate-300">
          {hasil.attempt.status === "expired"
            ? "Waktu pengerjaan habis — jawaban dinilai dari simpanan terakhir."
            : "Percobaan selesai. Berikut rincian jawaban Anda."}
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-end justify-between gap-4">
          <div>
            <CardTitle className="text-base">Skor Anda</CardTitle>
            <CardDescription>
              {ringkasan.benar} benar · {ringkasan.salah} salah dari {ringkasan.total_soal} soal ·
              durasi {formatDurasi(ringkasan.durasi_ms)}
            </CardDescription>
          </div>
          <p className="font-mono text-3xl font-bold tabular-nums text-teal-700 dark:text-teal-300">
            {ringkasan.persentase}
            <span className="text-base">%</span>
          </p>
        </CardHeader>
      </Card>

      <div className="flex flex-wrap gap-3">
        <CobaLagi quizId={hasil.attempt.quiz_id} />
        <Button href={`/kuis/${hasil.attempt.quiz_id}`} variant="secondary">
          Lihat detail kuis
        </Button>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Pembahasan</h2>
        {hasil.soal.length === 0 ? (
          <EmptyState title="Tidak ada jawaban" description="Tidak ada jawaban yang tercatat pada percobaan ini." />
        ) : (
          hasil.soal.map((item, index) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base">
                    {index + 1}. {item.teks}
                  </CardTitle>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      item.benar
                        ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200"
                        : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
                    }`}
                  >
                    {item.benar ? "Benar" : "Salah"}
                  </span>
                </div>
                <CardDescription>bobot {item.bobot}</CardDescription>
              </CardHeader>
              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {(item.opsi ?? [])
                  .slice()
                  .sort((a, b) => a.urutan - b.urutan)
                  .map((opsi) => {
                    const terpilih = opsi.id === item.opsi_terpilih_id;
                    const kunci = opsi.id === item.opsi_benar_id;
                    return (
                      <li
                        key={opsi.id}
                        className={`rounded-lg px-3 py-1.5 ${
                          kunci
                            ? "bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-100"
                            : terpilih
                              ? "bg-red-50 text-red-900 line-through dark:bg-red-950 dark:text-red-100"
                              : "text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {opsi.teks}
                        {kunci ? " — jawaban benar" : ""}
                        {terpilih && !kunci ? " — pilihan Anda" : ""}
                      </li>
                    );
                  })}
              </ul>
              {item.pembahasan ? (
                <p className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  <span className="font-medium text-slate-900 dark:text-slate-100">Pembahasan: </span>
                  {item.pembahasan}
                </p>
              ) : null}
            </Card>
          ))
        )}
      </section>
    </main>
  );
}
