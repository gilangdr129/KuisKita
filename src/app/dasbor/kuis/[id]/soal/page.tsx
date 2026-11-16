import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorSoal } from "@/components/kuis/editor-soal";
import { SOAL_SELECT, keSoalEditor, type SoalEditor } from "@/lib/creator/soal";
import { ambilAksesDasbor } from "@/lib/dasbor/akses";
import { getServiceSupabase } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/schemas";

export const instant = false;

export const metadata: Metadata = {
  title: "Editor soal",
  description: "Kelola soal, opsi, kunci jawaban, dan gambar untuk kuis Anda.",
};

type Props = {
  params: Promise<{ id: string }>;
};

/** Editor soal milik sendiri: muat struktur + kunci (opsi_benar_id) dari server. */
export default async function EditorSoalPage({ params }: Props) {
  const { id } = await params;
  const idValid = uuidSchema.safeParse(id);
  if (!idValid.success) {
    notFound();
  }

  const akses = await ambilAksesDasbor(`/dasbor/kuis/${id}/soal`);
  const supabase = getServiceSupabase();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, judul, status")
    .eq("id", idValid.data)
    .eq("owner_id", akses.userId)
    .maybeSingle();

  if (!quiz) {
    notFound();
  }

  const { data: soal } = await supabase
    .from("questions")
    .select(SOAL_SELECT)
    .eq("quiz_id", idValid.data)
    .order("urutan", { ascending: true });

  const kunciPerSoal = new Map<string, string>();
  const ids = (soal ?? []).map((item) => item.id);
  if (ids.length > 0) {
    const { data: kunci } = await supabase
      .from("question_keys")
      .select("question_id, option_id")
      .in("question_id", ids);
    for (const baris of kunci ?? []) {
      kunciPerSoal.set(baris.question_id, baris.option_id);
    }
  }

  const soalAwal: SoalEditor[] = (soal ?? []).map((item) =>
    keSoalEditor(item as unknown as Record<string, unknown>, kunciPerSoal.get(item.id) ?? null),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Editor soal</h1>
        <p className="text-slate-600 dark:text-slate-300">
          {String(quiz.judul)} — tambah soal, atur opsi & kunci jawaban, unggah gambar, lalu simpan.
          Struktur terkunci setelah kuis mulai dikerjakan.
        </p>
      </div>

      <EditorSoal
        quizId={String(quiz.id)}
        statusKuis={String(quiz.status)}
        soalAwal={soalAwal}
      />
    </main>
  );
}