"use client";

import * as React from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { readData } from "@/lib/http/client";

type Entri = {
  peringkat: number;
  attempt_id: string;
  username: string | null;
  skor: number;
  persentase: number | null;
  durasi_ms: number;
  submitted_at: string;
};

type Muatan = {
  items: Entri[];
  total: number;
  saya: Entri | null;
  sumber: "cache" | "database";
};

function formatDurasi(ms: number) {
  const totalDetik = Math.round(ms / 1000);
  const menit = Math.floor(totalDetik / 60);
  const detik = totalDetik % 60;
  return `${menit}:${String(detik).padStart(2, "0")}`;
}

/**
 * Papan peringkat kuis (F15): top N + posisi pemain yang sedang login.
 * Data diambil dari API di sisi klien agar tetap segar (cache Redis 45 s)
 * meski halaman detail-nya sendiri di-cache ISR.
 */
export function PapanPeringkat({ quizId }: { quizId: string }) {
  const [muatan, setMuatan] = React.useState<Muatan | null>(null);
  const [galat, setGalat] = React.useState(false);

  React.useEffect(() => {
    let aktif = true;
    void (async () => {
      const response = await fetch(`/api/quizzes/${quizId}/leaderboard?limit=10`);
      const data = aktif ? await readData<Muatan>(response) : null;
      if (!aktif) return;
      if (data) {
        setMuatan(data);
      } else {
        setGalat(true);
      }
    })();
    return () => {
      aktif = false;
    };
  }, [quizId]);

  return (
    <section id="peringkat" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Papan peringkat</h2>

      {galat ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Papan peringkat belum bisa dimuat. Coba lagi sebentar lagi.
        </p>
      ) : null}

      {!galat && muatan && muatan.items.length === 0 ? (
        <EmptyState
          title="Belum ada yang berperingkat"
          description="Jadilah yang pertama menyelesaikan kuis ini."
        />
      ) : null}

      {muatan && muatan.items.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top {muatan.items.length}</CardTitle>
            <CardDescription>
              Skor tertinggi; skor sama → waktu tercepat di atas.
            </CardDescription>
          </CardHeader>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                <th className="pb-2 pr-2 font-medium">#</th>
                <th className="pb-2 pr-2 font-medium">Pemain</th>
                <th className="pb-2 pr-2 text-right font-medium">Skor</th>
                <th className="pb-2 text-right font-medium">Waktu</th>
              </tr>
            </thead>
            <tbody>
              {muatan.items.map((entri) => {
                const iniSaya = muatan.saya?.attempt_id === entri.attempt_id;
                return (
                  <tr
                    key={entri.attempt_id}
                    className={
                      iniSaya
                        ? "border-t border-slate-100 bg-teal-50/60 dark:border-slate-800 dark:bg-teal-950/30"
                        : "border-t border-slate-100 dark:border-slate-800"
                    }
                  >
                    <td className="py-2 pr-2 tabular-nums">{entri.peringkat}</td>
                    <td className="py-2 pr-2">
                      {entri.username ? `@${entri.username}` : "pemain"}
                      {iniSaya ? (
                        <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-800 dark:bg-teal-900/50 dark:text-teal-200">
                          Anda
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      {Math.round(entri.skor)}
                      {entri.persentase != null ? (
                        <span className="text-slate-500 dark:text-slate-400">
                          {" "}
                          ({Math.round(entri.persentase)}%)
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatDurasi(entri.durasi_ms)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : null}

      {muatan?.saya ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Posisi Anda: <span className="font-semibold">#{muatan.saya.peringkat}</span> dari{" "}
          {muatan.total} pemain · skor {Math.round(muatan.saya.skor)} · {formatDurasi(muatan.saya.durasi_ms)}.
        </p>
      ) : null}
    </section>
  );
}