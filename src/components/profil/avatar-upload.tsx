"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/image/compress";
import { readError, type EnvelopeError } from "@/lib/http/client";

type Props = {
  avatarUrl: string | null;
};

/** Unggah avatar: kompresi di klien lalu POST multipart ke /api/uploads. */
export function AvatarUpload({ avatarUrl }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sukses, setSukses] = useState(false);

  const onPilih = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setSukses(false);

    try {
      const compressed = await compressImage(file);
      setPreview(URL.createObjectURL(compressed));
    } catch {
      setPreview(URL.createObjectURL(file));
    }
  };

  const onUnggah = async () => {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Pilih gambar terlebih dahulu.");
      return;
    }

    setLoading(true);
    setError(null);
    setSukses(false);

    const compressed = await compressImage(file).catch(() => file);
    const form = new FormData();
    form.set("file", compressed);
    form.set("tujuan", "avatar");

    const response = await fetch("/api/uploads", { method: "POST", body: form });

    if (response.ok) {
      setSukses(true);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } else {
      const parsed = (await readError(response)) as EnvelopeError | null;
      setError(parsed?.error.message ?? "Gagal mengunggah avatar.");
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <Avatar avatarUrl={preview ?? avatarUrl} />
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Pilih gambar avatar"
            onChange={(event) => void onPilih(event.target.files?.[0])}
            className="text-sm text-slate-600 file:mr-3 file:min-h-9 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:text-sm file:font-medium file:text-slate-900 dark:text-slate-400 dark:file:bg-slate-900 dark:file:text-slate-50"
          />
          <Button size="sm" onClick={() => void onUnggah()} loading={loading}>
            Simpan avatar
          </Button>
        </div>
      </div>
      {sukses ? (
        <p role="status" className="text-xs text-teal-700 dark:text-teal-300">
          Avatar tersimpan.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        JPG, PNG, atau WebP, maksimal 2 MB. Gambar otomatis diperkecil di perangkat Anda.
      </p>
    </div>
  );
}

export function Avatar({ avatarUrl }: { avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar dari Storage publik
      <img
        src={avatarUrl}
        alt="Avatar Anda"
        width={64}
        height={64}
        className="h-16 w-16 rounded-full border border-slate-200 object-cover dark:border-slate-700"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-100 text-lg font-semibold text-teal-700 dark:bg-teal-950 dark:text-teal-300"
    >
      ?
    </div>
  );
}
