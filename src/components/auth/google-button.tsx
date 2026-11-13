"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { readData, readError, type EnvelopeError } from "@/lib/http/client";

type Props = {
  /** Halaman tujuan setelah OAuth sukses (dikirim sebagai `next`). */
  next?: string;
};

/** Tombol masuk dengan Google: minta URL OAuth lalu alihkan browser. */
export function GoogleButton({ next = "/" }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ next }),
    });

    if (response.ok) {
      const payload = await readData<{ url?: string }>(response);
      if (payload?.url) {
        window.location.href = payload.url;
        return;
      }
      setError("Respons Google tidak lengkap. Coba lagi.");
      setLoading(false);
      return;
    }

    const parsed = (await readError(response)) as EnvelopeError | null;
    setError(parsed?.error.message ?? "Gagal memulai masuk dengan Google.");
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={onClick} loading={loading} className="w-full">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.3v3.1A12 12 0 0 0 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z"
          />
          <path
            fill="#EA4335"
            d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z"
          />
        </svg>
        Masuk dengan Google
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
