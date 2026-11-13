import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { RuangKuis, type SoalRuang } from "@/components/percobaan/ruang-kuis";
import { Skeleton } from "@/components/ui/skeleton";
import { mapRpcError } from "@/lib/attempts/errors";
import { attemptIdSchema } from "@/lib/validation/schemas";
import { Suspense } from "react";
import { createUserClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ruang kuis",
};

type Props = {
  params: Promise<{ id: string }>;
};

/** Halaman ruang kuis: state percobaan + soal/opsi (tanpa kunci) dari server. */
export default async function RuangKuisPage({ params }: Props) {
  const { id } = await params;

  const validation = attemptIdSchema.safeParse(id);
  if (!validation.success) {
    notFound();
  }

  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/masuk?next=/percobaan/${id}`);
  }

  const { data: state, error } = await supabase.rpc("get_attempt_state", {
    p_attempt_id: validation.data,
  });

  if (error) {
    const mapped = mapRpcError(error);
    if (mapped.status === 404) notFound();
    throw new Error(mapped.message);
  }

  const attempt = (state as { attempt?: Record<string, unknown> }).attempt ?? {};
  const quizId = attempt.quiz_id as string;

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, judul, durasi_detik")
    .eq("id", quizId)
    .maybeSingle();

  const { data: soal } = await supabase
    .from("questions")
    .select("id, teks, tipe, bobot, urutan, options ( id, teks, urutan )")
    .eq("quiz_id", quizId);

  const daftarSoal: SoalRuang[] = (soal ?? []).map((item) => ({
    id: item.id,
    teks: item.teks,
    tipe: item.tipe,
    bobot: Number(item.bobot),
    urutan: item.urutan,
    opsi: (item.options ?? []).map((o) => ({ id: o.id, teks: o.teks, urutan: o.urutan })),
  }));

  const stateJson = state as {
    acak?: { soal?: string[]; opsi?: Record<string, string[]> };
    server_now: string;
    sisa_detik: number;
  };

  return (
    <>
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex min-h-14 w-full max-w-2xl items-center justify-between px-4">
          <h1 className="text-base font-bold tracking-tight">{quiz?.judul ?? "Ruang kuis"}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Skor dihitung di server setelah submit.
          </p>
        </div>
      </header>
      <Suspense
        fallback={
          <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-10 w-full" />
          </main>
        }
      >
        <RuangKuis
          acak={stateJson.acak ?? {}}
          soal={daftarSoal}
          expiresAt={String(attempt.expires_at)}
          serverNow={stateJson.server_now}
          sisaAwal={stateJson.sisa_detik}
        />
      </Suspense>
    </>
  );
}
