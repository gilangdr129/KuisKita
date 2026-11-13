import type { Metadata } from "next";
import { Suspense } from "react";
import { KatalogDaftar } from "@/components/kuis/katalog-daftar";
import { KatalogSkeleton } from "@/components/kuis/katalog-skeleton";
import { ambilKatalog } from "@/lib/cache/katalog";

export const metadata: Metadata = {
  title: "Katalog kuis",
  description: "Telusuri kuis berbahasa Indonesia menurut kategori, kesulitan, dan durasi.",
};

type Props = {
  searchParams: Promise<{
    kategori?: string;
    kesulitan?: string;
    durasi?: string;
    q?: string;
    sortir?: string;
    cursor?: string;
    limit?: string;
  }>;
};

/** Isi katalog: akses searchParams + data cache terjadi di dalam Suspense. */
async function KatalogIsi({ searchParams }: Props) {
  const params = await searchParams;

  const katalog = await ambilKatalog({
    kategori: params.kategori,
    kesulitan: params.kesulitan,
    durasi: params.durasi,
    q: params.q,
    sortir: params.sortir ?? "terbaru",
    limit: params.limit ? Number(params.limit) : 20,
    cursor: params.cursor,
  });

  return (
    <KatalogDaftar
      key={JSON.stringify(params)}
      itemsAwal={katalog.items}
      hasMoreAwal={katalog.has_more}
      cursorAwal={katalog.next_cursor}
    />
  );
}

/**
 * Katalog kuis (ISR): dibaca lewat fungsi "use cache" bertag katalog.
 * Detail kuis memakai rute bersahabat (/kuis/[id]) yang memprerender 404
 * asli untuk kuis non-publik.
 */
export default function KatalogPage({ searchParams }: Props) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Katalog kuis</h1>
        <p className="text-slate-600 dark:text-slate-300">
          Pilih kuis, kerjakan, dan lihat posisi Anda di papan peringkat.
        </p>
      </div>

      <Suspense fallback={<KatalogSkeleton />}>
        <KatalogIsi searchParams={searchParams} />
      </Suspense>
    </main>
  );
}