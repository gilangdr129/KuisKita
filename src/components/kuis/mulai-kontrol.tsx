"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { readData, readError, type EnvelopeError } from "@/lib/http/client";

type Props = {
  quizId: string;
};

/** Tombol "Mulai": buat attempt lewat server lalu masuk ruang kuis. */
export function MulaiKontrol({ quizId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onMulai = async () => {
    setLoading(true);
    setError(null);

    const response = await fetch("/api/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quiz_id: quizId }),
    });

    if (response.ok) {
      const payload = await readData<{ attempt?: { id: string } }>(response);
      if (payload?.attempt?.id) {
        router.push(`/percobaan/${payload.attempt.id}`);
        router.refresh();
        return;
      }
      setError("Respons percobaan tidak lengkap. Coba lagi.");
    } else {
      const parsed = (await readError(response)) as EnvelopeError | null;
      setError(parsed?.error.message ?? "Gagal memulai percobaan.");
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button onClick={() => void onMulai()} loading={loading}>
        Mulai
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
