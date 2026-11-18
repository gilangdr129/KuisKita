import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RiwayatDaftar, type RiwayatItem } from "@/components/riwayat/riwayat-daftar";
import { createUserClient } from "@/lib/supabase/server";

export const instant = false;

export const metadata: Metadata = {
  title: "Riwayat percobaan",
  description: "Semua percobaan kuis milik Anda: sedang berjalan, selesai, dan kedaluwarsa.",
};

/** Halaman riwayat percobaan (milik sendiri, dijaga RLS attempts_self_read). */
export default async function RiwayatPage() {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/masuk?next=/riwayat");
  }

  const { data } = await supabase
    .from("attempts")
    .select(
      "id, quiz_id, status, skor, persentase, durasi_ms, started_at, submitted_at, expires_at, quizzes ( id, judul )",
    )
    .order("started_at", { ascending: false })
    .limit(50);

  const awal: RiwayatItem[] = (data ?? []).map((row) => {
    const embed = (row.quizzes ?? null) as unknown as { id: string; judul: string } | null;
    return {
      id: String(row.id),
      quiz_id: String(row.quiz_id),
      quiz_judul: embed?.judul ?? null,
      status: String(row.status),
      skor: row.skor == null ? null : Number(row.skor),
      persentase: row.persentase == null ? null : Number(row.persentase),
      durasi_ms: row.durasi_ms == null ? null : Number(row.durasi_ms),
      started_at: String(row.started_at),
      submitted_at: row.submitted_at == null ? null : String(row.submitted_at),
      expires_at: String(row.expires_at),
    };
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Riwayat percobaan</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Setiap percobaan yang Anda mulai: lanjutkan yang masih berjalan, tinjau ulang hasil &
          pembahasan yang sudah selesai.
        </p>
      </div>

      <RiwayatDaftar awal={awal} />
    </main>
  );
}