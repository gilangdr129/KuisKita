"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

type Props = {
  quizId: string;
};

/**
 * Kontrol "Mulai" untuk halaman detail (statis): sesi diperiksa di klien,
 * karena halaman dirender sebagai ISR tanpa cookie. Pengunjung diarahkan ke
 * halaman masuk dengan `next` kembali ke kuis ini.
 */
export function MulaiKontrol({ quizId }: Props) {
  const router = useRouter();
  const [sudahLogin, setSudahLogin] = React.useState<boolean | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => setSudahLogin(Boolean(data.user)));
  }, []);

  const onMulai = async () => {
    setLoading(true);
    setError(null);
    const response = await fetch("/api/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quiz_id: quizId }),
    });

    if (response.ok) {
      const payload = (await response.json()) as { data?: { attempt?: { id: string } } };
      if (payload.data?.attempt?.id) {
        router.push(`/percobaan/${payload.data.attempt.id}`);
        return;
      }
      setError("Respons percobaan tidak lengkap.");
    } else {
      const parsed = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(parsed?.error?.message ?? "Gagal memulai percobaan.");
    }
    setLoading(false);
  };

  if (sudahLogin === null) {
    return <Button disabled>Memeriksa sesi…</Button>;
  }

  if (!sudahLogin) {
    return <Button href={`/masuk?next=/kuis/${quizId}`}>Masuk untuk mulai</Button>;
  }

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