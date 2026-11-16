"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { readError, type EnvelopeError } from "@/lib/http/client";

type Props = {
  id: string;
  judul: string;
};

/**
 * Duplikasi kuis (F14): salinan metadata + soal + opsi + kunci sebagai draf
 * baru. Ini jalur "versi baru" untuk kuis yang struktur terkunci karena sudah
 * dikerjakan. Setelah berhasil, pengguna dibawa ke editor salinannya.
 */
export function KuisDuplikasi({ id, judul }: Props) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);

  const duplikasi = async () => {
    setLoading(true);
    setGalat(null);

    const response = await fetch(`/api/creator/quizzes/${id}/duplicate`, { method: "POST" });

    if (response.ok) {
      const data = (await response.json()) as { data?: { url_editor?: string } };
      if (data.data?.url_editor) {
        router.push(data.data.url_editor);
        return;
      }
      router.refresh();
      return;
    }

    const error = (await readError(response)) as EnvelopeError | null;
    setGalat(error?.error.message ?? `Gagal menduplikasi "${judul}".`);
    setLoading(false);
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm" loading={loading} onClick={() => void duplikasi()}>
        Duplikasi
      </Button>
      {galat ? (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {galat}
        </span>
      ) : null}
    </span>
  );
}