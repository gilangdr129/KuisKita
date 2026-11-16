"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readError, type EnvelopeError } from "@/lib/http/client";
import {
  deskripsiKuisSchema,
  judulKuisSchema,
  quizDifficultySchema,
  quizVisibilitySchema,
  slugSchema,
} from "@/lib/validation/schemas";

export type KategoriOpsi = { slug: string; nama: string };

export type KuisAwal = {
  id: string;
  judul: string;
  deskripsi: string | null;
  kesulitan: "easy" | "medium" | "hard";
  durasi_detik: number;
  visibilitas: "public" | "unlisted" | "private";
  acak_soal: boolean;
  acak_opsi: boolean;
  maks_percobaan: number | null;
  kategori: { slug: string | null };
};

/**
 * Skema form kreator. Durasi diisi dalam MENIT (lebih manusiawi) lalu diubah
 * ke detik saat dikirim; "" pada kategori/maks_percobaan berarti "tidak ada".
 * Semua bidang bernilai string agar cocok dengan nilai input HTML (tanpa
 * coerce/transform, agar resolver & defaultValues tetap setipe).
 */
const ANGKA_MENIT = /^\d{1,4}$/;

const formKuisSchema = z.object({
  judul: judulKuisSchema,
  deskripsi: deskripsiKuisSchema,
  kategori: z.union([z.literal(""), slugSchema]),
  kesulitan: quizDifficultySchema,
  durasi_menit: z
    .string()
    .trim()
    .regex(ANGKA_MENIT, "Durasi harus angka menit")
    .refine((nilai) => Number(nilai) >= 1 && Number(nilai) <= 1440, "Durasi 1-1440 menit"),
  acak_soal: z.boolean(),
  acak_opsi: z.boolean(),
  maks_percobaan: z.union([
    z.literal(""),
    z
      .string()
      .trim()
      .regex(/^\d{1,3}$/, "Maksimal percobaan harus angka")
      .refine((nilai) => Number(nilai) >= 1 && Number(nilai) <= 100, "Maksimal percobaan 1-100"),
  ]),
  visibilitas: quizVisibilitySchema,
});

type FormValues = z.infer<typeof formKuisSchema>;

type Props = {
  mode: "buat" | "edit";
  kategoriOpsi: KategoriOpsi[];
  /** Terisi saat mode edit. */
  kuisAwal?: KuisAwal;
};

const KESULITAN_LABEL: Record<string, string> = {
  easy: "Mudah",
  medium: "Sedang",
  hard: "Sulit",
};

const VISIBILITAS_LABEL: Record<string, string> = {
  public: "Publik — tampil di katalog",
  unlisted: "Tersembunyi — hanya yang punya tautan",
  private: "Privat — hanya Anda",
};

const selectClass =
  "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50";

/** Form buat/edit metadata kuis (draf selalu; terbit = F14). */
export function KuisForm({ mode, kategoriOpsi, kuisAwal }: Props) {
  const router = useRouter();
  const [galat, setGalat] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formKuisSchema),
    defaultValues: {
      judul: kuisAwal?.judul ?? "",
      deskripsi: kuisAwal?.deskripsi ?? "",
      kategori: kuisAwal?.kategori.slug ?? "",
      kesulitan: kuisAwal?.kesulitan ?? "medium",
      durasi_menit: String(kuisAwal ? Math.max(1, Math.round(kuisAwal.durasi_detik / 60)) : 10),
      acak_soal: kuisAwal?.acak_soal ?? false,
      acak_opsi: kuisAwal?.acak_opsi ?? false,
      maks_percobaan: kuisAwal?.maks_percobaan != null ? String(kuisAwal.maks_percobaan) : "",
      visibilitas: kuisAwal?.visibilitas ?? "public",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const body = {
      judul: values.judul.trim(),
      deskripsi: values.deskripsi?.trim() ?? "",
      kategori: values.kategori || null,
      durasi_detik: Number(values.durasi_menit) * 60,
      kesulitan: values.kesulitan,
      acak_soal: values.acak_soal,
      acak_opsi: values.acak_opsi,
      maks_percobaan: values.maks_percobaan === "" ? null : Number(values.maks_percobaan),
      visibilitas: values.visibilitas,
    };

    const response = await fetch(
      mode === "buat" ? "/api/creator/quizzes" : `/api/creator/quizzes/${kuisAwal?.id}`,
      {
        method: mode === "buat" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (response.ok) {
      router.push(mode === "buat" ? "/dasbor?sukses=dibuat" : "/dasbor?sukses=diperbarui");
      router.refresh();
      return;
    }

    const error = (await readError(response)) as EnvelopeError | null;
    setGalat(error?.error.message ?? "Gagal menyimpan kuis.");
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Input
        label="Judul kuis"
        placeholder="Misal: Kuis Sains untuk SD"
        maxLength={120}
        error={errors.judul?.message}
        {...register("judul")}
      />

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">Deskripsi</span>
        <textarea
          rows={4}
          maxLength={2000}
          placeholder="Jelaskan isi kuis secara singkat (maksimal 2000 karakter)"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
          {...register("deskripsi")}
        />
        {errors.deskripsi ? (
          <span className="text-xs text-red-600 dark:text-red-400">{errors.deskripsi.message}</span>
        ) : null}
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">Kategori</span>
          <select className={selectClass} {...register("kategori")}>
            <option value="">Tanpa kategori</option>
            {kategoriOpsi.map((opsi) => (
              <option key={opsi.slug} value={opsi.slug}>
                {opsi.nama}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">Kesulitan</span>
          <select className={selectClass} {...register("kesulitan")}>
            {Object.entries(KESULITAN_LABEL).map(([nilai, label]) => (
              <option key={nilai} value={nilai}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <Input
          label="Durasi (menit)"
          type="number"
          min={1}
          max={1440}
          error={errors.durasi_menit?.message}
          {...register("durasi_menit")}
        />

        <Input
          label="Maksimal percobaan (kosong = tanpa batas)"
          type="number"
          min={1}
          max={100}
          placeholder="Kosongkan untuk tanpa batas"
          error={errors.maks_percobaan?.message}
          {...register("maks_percobaan")}
        />

        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-slate-700 dark:text-slate-200">Visibilitas</span>
          <select className={selectClass} {...register("visibilitas")}>
            {Object.entries(VISIBILITAS_LABEL).map(([nilai, label]) => (
              <option key={nilai} value={nilai}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" {...register("acak_soal")} />
          Acak urutan soal
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" {...register("acak_opsi")} />
          Acak urutan opsi jawaban
        </label>
      </div>

      {galat ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {galat}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={isSubmitting}>
          {mode === "buat" ? "Buat kuis draf" : "Simpan perubahan"}
        </Button>
        <Button variant="ghost" href="/dasbor">
          Batal
        </Button>
      </div>
    </form>
  );
}