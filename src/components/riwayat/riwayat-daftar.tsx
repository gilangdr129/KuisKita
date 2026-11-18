"use client";

import * as React from "react";
import { CobaLagi } from "@/components/percobaan/coba-lagi";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export type RiwayatItem = {
  id: string;
  quiz_id: string;
  quiz_judul: string | null;
  status: string;
  skor: number | null;
  persentase: number | null;
  durasi_ms: number | null;
  started_at: string;
  submitted_at: string | null;
  expires_at: string;
};

const STATUS: Record<string, { label: string; kelas: string }> = {
  in_progress: {
    label: "Sedang berjalan",
    kelas: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  },
  submitted: {
    label: "Selesai",
    kelas: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200",
  },
  expired: {
    label: "Kedaluwarsa",
    kelas: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
};

const STATUS_BAWAAN = { label: "Tidak dikenal", kelas: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" };

const FILTER = [
  { nilai: "semua", label: "Semua" },
  { nilai: "in_progress", label: "Sedang berjalan" },
  { nilai: "submitted", label: "Selesai" },
  { nilai: "expired", label: "Kedaluwarsa" },
] as const;

function formatTanggal(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function formatDurasi(ms: number | null) {
  if (ms == null) return "—";
  const totalDetik = Math.round(ms / 1000);
  const menit = Math.floor(totalDetik / 60);
  const detik = totalDetik % 60;
  return `${menit}:${String(detik).padStart(2, "0")}`;
}

/** Riwayat percobaan milik sendiri, dengan filter status (client-side). */
export function RiwayatDaftar({ awal }: { awal: RiwayatItem[] }) {
  const [filter, setFilter] = React.useState<string>("semua");

  const jumlah = (nilai: string) =>
    nilai === "semua" ? awal.length : awal.filter((item) => item.status === nilai).length;
  const tampil = filter === "semua" ? awal : awal.filter((item) => item.status === filter);

  if (awal.length === 0) {
    return (
      <EmptyState
        title="Belum ada riwayat"
        description="Percobaan kuis yang Anda mulai akan muncul di sini."
        action={<Button href="/kuis">Jelajahi katalog</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter status riwayat">
        {FILTER.map((opsi) => {
          const aktif = filter === opsi.nilai;
          return (
            <button
              key={opsi.nilai}
              type="button"
              aria-pressed={aktif}
              onClick={() => setFilter(opsi.nilai)}
              className={
                aktif
                  ? "min-h-9 rounded-full bg-teal-600 px-3 text-xs font-medium text-white"
                  : "min-h-9 rounded-full border border-slate-300 px-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
              }
            >
              {opsi.label} ({jumlah(opsi.nilai)})
            </button>
          );
        })}
      </div>

      {tampil.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
          Tidak ada percobaan dengan status ini.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tampil.map((item) => {
            const meta = STATUS[item.status] ?? { label: item.status, kelas: STATUS_BAWAAN.kelas };
            return (
              <li key={item.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold">
                          {item.quiz_judul ?? "Kuis tidak tersedia lagi"}
                        </h2>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.kelas}`}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Dimulai {formatTanggal(item.started_at)}
                        {item.status !== "in_progress" && item.submitted_at
                          ? ` · diselesaikan ${formatTanggal(item.submitted_at)}`
                          : ""}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {item.status === "in_progress" ? (
                          <>Batas waktu {formatTanggal(item.expires_at)}</>
                        ) : (
                          <>
                            Skor {item.skor ?? 0}
                            {item.persentase != null ? ` (${Math.round(item.persentase)}%)` : ""} · durasi{" "}
                            {formatDurasi(item.durasi_ms)}
                          </>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {item.status === "in_progress" ? (
                        <Button variant="secondary" size="sm" href={`/percobaan/${item.id}`}>
                          Lanjutkan
                        </Button>
                      ) : (
                        <>
                          <Button variant="secondary" size="sm" href={`/percobaan/${item.id}/hasil`}>
                            Lihat hasil
                          </Button>
                          {item.quiz_judul ? <CobaLagi quizId={item.quiz_id} /> : null}
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}