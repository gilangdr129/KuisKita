"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/kuis/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { readError, type EnvelopeError } from "@/lib/http/client";

export type AdminKuis = {
  id: string;
  judul: string;
  status: string;
  visibilitas: string;
  created_at: string;
  pemilik: string | null;
};

export type AdminPengguna = {
  id: string;
  username: string;
  role: string;
  created_at: string;
};

export type AdminLaporan = {
  id: string;
  alasan: string;
  status: string;
  created_at: string;
  kuis_judul: string | null;
  pelapor: string | null;
};

type Props = {
  kuis: AdminKuis[];
  pengguna: AdminPengguna[];
  laporan: AdminLaporan[];
};

const TABS = [
  { nilai: "kuis", label: "Kuis" },
  { nilai: "pengguna", label: "Pengguna" },
  { nilai: "laporan", label: "Laporan" },
] as const;

function formatTanggal(iso: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(iso));
}

/** Dasbor admin: tab + pencarian dasar + suspend kuis dengan alasan opsional. */
export function AdminDasbor({ kuis, pengguna, laporan }: Props) {
  const router = useRouter();
  const [tab, setTab] = React.useState<string>("kuis");
  const [cari, setCari] = React.useState("");
  const [menangguhkan, setMenangguhkan] = React.useState<string | null>(null);
  const [alasan, setAlasan] = React.useState("");
  const [pesan, setPesan] = React.useState<{ jenis: "sukses" | "galat"; teks: string } | null>(null);
  const [memuat, setMemuat] = React.useState(false);

  const kuisTampil = kuis.filter((item) =>
    `${item.judul} ${item.pemilik ?? ""}`.toLowerCase().includes(cari.trim().toLowerCase()),
  );
  const penggunaTampil = pengguna.filter((item) =>
    `${item.username} ${item.role}`.toLowerCase().includes(cari.trim().toLowerCase()),
  );
  const laporanTampil = laporan.filter((item) =>
    `${item.alasan} ${item.kuis_judul ?? ""} ${item.pelapor ?? ""}`.toLowerCase().includes(cari.trim().toLowerCase()),
  );

  const tangguhkan = async (quizId: string) => {
    setMemuat(true);
    setPesan(null);

    const response = await fetch(`/api/admin/quizzes/${quizId}/suspend`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alasan: alasan.trim() || undefined }),
    });

    setMemuat(false);
    setMenangguhkan(null);
    setAlasan("");

    if (response.ok) {
      const data = (await response.json()) as { data?: { notifikasi?: { terkirim?: boolean; alasan?: string } } };
      const info = data.data?.notifikasi;
      setPesan({
        jenis: "sukses",
        teks: `Kuis ditangguhkan. ${info?.terkirim ? "Email notifikasi terkirim." : `Notifikasi: ${info?.alasan ?? "dicatat di log"}.`}`,
      });
      router.refresh();
      return;
    }

    const error = (await readError(response)) as EnvelopeError | null;
    setPesan({ jenis: "galat", teks: error?.error.message ?? "Gagal menangguhkan kuis." });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Pilih bagian admin">
        {TABS.map((opsi) => (
          <button
            key={opsi.nilai}
            type="button"
            aria-pressed={tab === opsi.nilai}
            onClick={() => setTab(opsi.nilai)}
            className={
              tab === opsi.nilai
                ? "min-h-9 rounded-full bg-teal-600 px-3 text-xs font-medium text-white"
                : "min-h-9 rounded-full border border-slate-300 px-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
            }
          >
            {opsi.label} (
            {opsi.nilai === "kuis" ? kuis.length : opsi.nilai === "pengguna" ? pengguna.length : laporan.length})
          </button>
        ))}
      </div>

      <input
        type="search"
        value={cari}
        onChange={(event) => setCari(event.target.value)}
        placeholder="Cari judul, username, atau isi laporan…"
        aria-label="Pencarian dasar"
        className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
      />

      {pesan ? (
        <p
          role={pesan.jenis === "galat" ? "alert" : "status"}
          className={
            pesan.jenis === "galat"
              ? "rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
              : "rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
          }
        >
          {pesan.teks}
        </p>
      ) : null}

      {tab === "kuis" ? (
        kuisTampil.length === 0 ? (
          <EmptyState title="Tidak ada kuis" description="Tidak ada kuis yang cocok dengan pencarian." />
        ) : (
          <ul className="flex flex-col gap-3">
            {kuisTampil.map((item) => (
              <li key={item.id}>
                <Card>
                  <CardHeader className="flex-row items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <CardTitle className="text-base">{item.judul}</CardTitle>
                      <CardDescription>
                        @{item.pemilik ?? "tak dikenal"} · {item.visibilitas} · dibuat {formatTanggal(item.created_at)}
                      </CardDescription>
                    </div>
                    <StatusBadge status={item.status} />
                  </CardHeader>

                  {menangguhkan === item.id ? (
                    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                      <label className="flex flex-col gap-1 text-sm">
                        <span>Alasan penangguhan (opsional)</span>
                        <input
                          type="text"
                          value={alasan}
                          maxLength={500}
                          onChange={(event) => setAlasan(event.target.value)}
                          placeholder="Misal: konten tidak pantas"
                          className="min-h-9 rounded-md border border-slate-300 px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                        />
                      </label>
                      <div className="flex gap-2">
                        <Button variant="danger" size="sm" loading={memuat} onClick={() => void tangguhkan(item.id)}>
                          Ya, tangguhkan
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setMenangguhkan(null)}>
                          Batal
                        </Button>
                      </div>
                    </div>
                  ) : item.status !== "suspended" ? (
                    <div className="mt-3">
                      <Button variant="danger" size="sm" onClick={() => setMenangguhkan(item.id)}>
                        Tangguhkan
                      </Button>
                    </div>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "pengguna" ? (
        penggunaTampil.length === 0 ? (
          <EmptyState title="Tidak ada pengguna" description="Tidak ada pengguna yang cocok dengan pencarian." />
        ) : (
          <ul className="flex flex-col gap-3">
            {penggunaTampil.map((item) => (
              <li key={item.id}>
                <Card>
                  <CardHeader className="flex-row items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-base">@{item.username}</CardTitle>
                      <CardDescription>Bergabung {formatTanggal(item.created_at)}</CardDescription>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {item.role}
                    </span>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "laporan" ? (
        laporanTampil.length === 0 ? (
          <EmptyState title="Belum ada laporan" description="Laporan pengguna atas kuis akan muncul di sini." />
        ) : (
          <ul className="flex flex-col gap-3">
            {laporanTampil.map((item) => (
              <li key={item.id}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{item.kuis_judul ?? "Kuis dihapus"}</CardTitle>
                    <CardDescription>
                      {item.alasan} — oleh @{item.pelapor ?? "tak dikenal"} · {formatTanggal(item.created_at)} ·{" "}
                      {item.status}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}