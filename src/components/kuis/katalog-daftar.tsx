"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readData } from "@/lib/http/client";
import type { KatalogItem } from "@/lib/cache/katalog";

const KATEGORI = [
  "umum",
  "sains",
  "sejarah",
  "geografi",
  "teknologi",
  "hiburan",
  "bahasa",
  "matematika",
  "budaya",
];

const KESULITAN = ["easy", "medium", "hard"];
const DURASI = ["pendek", "sedang", "panjang"];

type Props = {
  itemsAwal: KatalogItem[];
  hasMoreAwal: boolean;
  cursorAwal: string | null;
};

/** Katalog: filter (sinkron ke URL), daftar kuis, dan "Muat lebih banyak". */
export function KatalogDaftar({ itemsAwal, hasMoreAwal, cursorAwal }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = React.useState<KatalogItem[]>(itemsAwal);
  const [cursor, setCursor] = React.useState<string | null>(cursorAwal);
  const [hasMore, setHasMore] = React.useState(hasMoreAwal);
  const [loading, setLoading] = React.useState(false);
  // Saat filter berubah, komponen di-remount lewat `key` di halaman, sehingga
  // state "muat lebih banyak" kembali bersih tanpa efek sinkronisasi.

  const setParam = (nama: string, nilai: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nilai) {
      params.set(nama, nilai);
    } else {
      params.delete(nama);
    }
    router.push(`/kuis?${params.toString()}`);
  };

  const muatLagi = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    const params = new URLSearchParams(searchParams.toString());
    params.set("cursor", cursor);
    const response = await fetch(`/api/quizzes?${params.toString()}`);
    if (response.ok) {
      const hasil = await readData<{
        items: KatalogItem[];
        next_cursor: string | null;
        has_more: boolean;
      }>(response);
      if (hasil) {
        setItems((prev) => [...prev, ...hasil.items]);
        setCursor(hasil.next_cursor);
        setHasMore(hasil.has_more);
      }
    }
    setLoading(false);
  };

  const nilai = searchParams.get("kategori") ?? "";
  const kesulitan = searchParams.get("kesulitan") ?? "";
  const durasi = searchParams.get("durasi") ?? "";
  const q = searchParams.get("q") ?? "";
  const sortir = searchParams.get("sortir") ?? "terbaru";

  return (
    <div className="flex flex-col gap-4">
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          setParam("q", q);
        }}
      >
        <Input
          value={q}
          label="Cari kuis"
          placeholder="Judul atau deskripsi…"
          maxLength={100}
          minLength={1}
          hint="Maksimal 100 karakter"
          onChange={(event) => setParam("q", event.target.value)}
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">Kategori</span>
          <select
            value={nilai}
            onChange={(event) => setParam("kategori", event.target.value)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
          >
            <option value="">Semua</option>
            {KATEGORI.map((slug) => (
              <option key={slug} value={slug}>
                {slug}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">Kesulitan</span>
          <select
            value={kesulitan}
            onChange={(event) => setParam("kesulitan", event.target.value)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
          >
            <option value="">Semua</option>
            {KESULITAN.map((slug) => (
              <option key={slug} value={slug}>
                {slug}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">Durasi</span>
          <select
            value={durasi}
            onChange={(event) => setParam("durasi", event.target.value)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
          >
            <option value="">Semua</option>
            {DURASI.map((slug) => (
              <option key={slug} value={slug}>
                {slug}
              </option>
            ))}
          </select>
        </label>
      </form>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">{items.length} kuis ditampilkan</p>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Urutkan:</span>
          <button
            type="button"
            onClick={() => setParam("sortir", "terbaru")}
            className={sortir === "terbaru" ? "font-semibold text-teal-700 dark:text-teal-300" : ""}
          >
            Terbaru
          </button>
          <button
            type="button"
            onClick={() => setParam("sortir", "terpopuler")}
            className={
              sortir === "terpopuler" ? "font-semibold text-teal-700 dark:text-teal-300" : ""
            }
          >
            Terpopuler
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
          Tidak ada kuis yang cocok dengan filter ini.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`/kuis/${item.id}`}
                className="flex h-full flex-col gap-2 rounded-xl border border-slate-200 p-4 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
              >
                <h2 className="text-base font-semibold">{item.judul}</h2>
                <p className="line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                  {item.deskripsi}
                </p>
                <p className="mt-auto text-xs text-slate-500 dark:text-slate-400">
                  {item.kategori?.nama ?? "Tanpa kategori"} · {item.kesulitan} ·{" "}
                  {Math.round(item.durasi_detik / 60)} menit · {item.jumlah_soal} soal ·{" "}
                  {item.jumlah_percobaan} percobaan
                  {item.skor_tertinggi != null
                    ? ` · skor tertinggi ${Math.round(item.skor_tertinggi)}%`
                    : ""}
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}

      {hasMore ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => void muatLagi()} loading={loading}>
            Muat lebih banyak
          </Button>
        </div>
      ) : null}
    </div>
  );
}