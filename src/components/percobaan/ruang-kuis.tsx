"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export type SoalRuang = {
  id: string;
  teks: string;
  tipe: string;
  bobot: number;
  urutan: number;
  opsi: { id: string; teks: string; urutan: number }[];
};

type Props = {
  /** Snapshot acak dari server: urutan soal + urutan opsi per soal. */
  acak: { soal?: string[]; opsi?: Record<string, string[]> };
  soal: SoalRuang[];
  /** ISO timestamp expires_at dari server. */
  expiresAt: string;
  /** ISO timestamp server_now saat state diambil — untuk koreksi jam klien. */
  serverNow: string;
  sisaAwal: number;
};

function formatWaktu(totalDetik: number) {
  const menit = Math.floor(totalDetik / 60);
  const detik = totalDetik % 60;
  return `${String(menit).padStart(2, "0")}:${String(detik).padStart(2, "0")}`;
}

/**
 * Ruang kuis (kerangka F7): urutan sesuai snapshot acak server, timer turunan
 * dari expires_at − server_now (dengan koreksi selisih jam klien), penanda
 * navigasi soal. Penyimpanan jawaban otomatis hadir di Fase 8.
 */
export function RuangKuis({ acak, soal, expiresAt, serverNow, sisaAwal }: Props) {
  const router = useRouter();
  const [sisa, setSisa] = React.useState(sisaAwal);

  // Selisih jam dihitung SETELAH mount (efek), bukan saat render: server_now −
  // waktu klien saat state diterima. Timer selalu memakai waktu server
  // (expires_at), sehingga manipulasi jam perangkat tak memperpanjang waktu.
  const skewRef = React.useRef(0);

  React.useEffect(() => {
    skewRef.current = new Date(serverNow).getTime() - Date.now();

    const tick = () => {
      const tersisaMs = new Date(expiresAt).getTime() - (Date.now() + skewRef.current);
      setSisa(Math.max(0, Math.floor(tersisaMs / 1000)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, serverNow]);

  const urutanSoal = React.useMemo(() => {
    const daftar = acak.soal?.length ? [...acak.soal] : soal.map((s) => s.id);
    return daftar
      .map((id) => soal.find((s) => s.id === id))
      .filter((s): s is SoalRuang => Boolean(s));
  }, [acak.soal, soal]);

  const [indexSoal, setIndexSoal] = React.useState(0);
  const soalAktif = urutanSoal[Math.min(indexSoal, urutanSoal.length - 1)];

  const opsiTerurut = React.useMemo(() => {
    if (!soalAktif) return [];
    const dasar = [...soalAktif.opsi].sort((a, b) => a.urutan - b.urutan);
    const urutan = acak.opsi?.[soalAktif.id];
    if (!urutan?.length) return dasar;
    return urutan.map((id) => dasar.find((o) => o.id === id)).filter((o) => Boolean(o));
  }, [acak.opsi, soalAktif]);

  if (urutanSoal.length === 0 || !soalAktif) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <EmptyState
          title="Belum ada soal"
          description="Kuis ini tidak memiliki soal yang bisa dikerjakan."
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Soal {indexSoal + 1} dari {urutanSoal.length}
        </p>
        <p
          role="timer"
          className={`font-mono text-lg font-semibold tabular-nums ${
            sisa <= 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-50"
          }`}
        >
          {sisa <= 0 ? "Waktu habis" : formatWaktu(sisa)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{soalAktif.teks}</CardTitle>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {soalAktif.tipe === "boolean" ? "Benar / salah" : "Pilihan ganda"} · bobot {soalAktif.bobot}
          </p>
        </CardHeader>
        <div className="mt-4 flex flex-col gap-2">
          {opsiTerurut.map((opsi, index) => (
            <div
              key={opsi?.id ?? index}
              className="min-h-11 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              {opsi?.teks}
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          Penyimpanan jawaban otomatis hadir di Fase 8 — saat ini jawaban belum dapat dipilih.
        </p>
      </Card>

      <nav className="flex flex-wrap gap-2" aria-label="Navigasi soal">
        {urutanSoal.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setIndexSoal(index)}
            aria-current={index === indexSoal ? "true" : undefined}
            className={`min-h-9 min-w-9 rounded-lg border text-sm font-medium ${
              index === indexSoal
                ? "border-teal-600 bg-teal-600 text-white"
                : "border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            {index + 1}
          </button>
        ))}
      </nav>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          onClick={() => setIndexSoal((i) => Math.max(0, i - 1))}
          disabled={indexSoal === 0}
        >
          Sebelumnya
        </Button>
        <Button
          onClick={() => setIndexSoal((i) => Math.min(urutanSoal.length - 1, i + 1))}
          disabled={indexSoal >= urutanSoal.length - 1}
        >
          Berikutnya
        </Button>
      </div>

      <div className="flex justify-start">
        <Button variant="ghost" onClick={() => router.back()}>
          Kembali
        </Button>
      </div>
    </main>
  );
}
