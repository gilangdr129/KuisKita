"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";
import { readData, readError, type EnvelopeError } from "@/lib/http/client";

type Props = {
  quizId: string;
};

/** Mulai percobaan baru (menghormati batas maks_percobaan). */
export function CobaLagi({ quizId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const onCobaLagi = async () => {
    setLoading(true);
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
    }

    const error = (await readError(response)) as EnvelopeError | null;
    toast({
      title: "Belum bisa mencoba lagi",
      description: error?.error.message ?? "Coba lagi beberapa saat.",
      variant: "danger",
    });
    setLoading(false);
  };

  return (
    <Button onClick={() => void onCobaLagi()} loading={loading}>
      Coba lagi
    </Button>
  );
}
