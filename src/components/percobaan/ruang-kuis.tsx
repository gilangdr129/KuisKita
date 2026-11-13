"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/providers/toast-provider";
import { readError, type EnvelopeError } from "@/lib/http/client";

export type SoalRuang = {
  id: string;
  teks: string;
  tipe: string;
  bobot: number;
  urutan: number;
  opsi: { id: string; teks: string; urutan: number }[];
};

export type JawabanTersimpan = {
  pertanyaan_id: string;
  opsi_id: string;
};

type Props = {
  attemptId: string;
  /** Snapshot acak dari server: urutan soal + urutan opsi per soal. */
  acak: { soal?: string[]; opsi?: Record<string, string[]> };
  soal: SoalRuang[];
  /** Jawaban yang sudah tersimpan di server (dasar resume & 2 tab). */
  jawabanAwal: JawabanTersimpan[];
  /** ISO timestamp expires_at dari server. */
  expiresAt: string;
  /** ISO timestamp server_now saat state diambil — untuk koreksi jam klien. */
  serverNow: string;
  sisaAwal: number;
};

type StatusSimpan = "idle" | "menyimpan" | "tersimpan" | "menunggu" | "mencoba-lagi";

const BACKOFF_DETIK = [1, 2, 4, 8, 16, 30];

function formatWaktu(totalDetik: number) {
  const menit = Math.floor(totalDetik / 60);
  const detik = totalDetik % 60;
  return `${String(menit).padStart(2, "0")}:${String(detik).padStart(2, "0")}`;
}

/**
 * Ruang kuis (F8): satu soal per layar di HP, pilihan jawaban tersimpan
 * otomatis (autosave), antre offline dengan retry backoff, penanda soal
 * belum dijawab, dan tombol Submit yang mati selama ada jawaban belum
 * tersimpan. Urutan & timer mengikuti server (snapshot acak + expires_at).
 */
export function RuangKuis({
  attemptId,
  acak,
  soal,
  jawabanAwal,
  expiresAt,
  serverNow,
  sisaAwal,
}: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const [sisa, setSisa] = React.useState(sisaAwal);
  const [indexSoal, setIndexSoal] = React.useState(0);

  // Server-state-wins: jawaban awal dari server (refresh/2 tab membacanya).
  const [jawaban, setJawaban] = React.useState<Record<string, string>>(() =>
    Object.fromEntries((jawabanAwal ?? []).map((j) => [j.pertanyaan_id, j.opsi_id])),
  );

  // Antrian jawaban yang belum terkonfirmasi server (offline/gagal kirim).
  const antreRef = React.useRef(
    new Map<string, { pertanyaan_id: string; opsi_id: string; percobaan: number }>(),
  );
  const timerRetryRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [jumlahMenunggu, setJumlahMenunggu] = React.useState(0);
  const [statusSimpan, setStatusSimpan] = React.useState<StatusSimpan>("idle");
  const [mengirim, setMengirim] = React.useState(false);
  const [menSubmit, setMenSubmit] = React.useState(false);

  const onSubmit = async () => {
    setMenSubmit(true);
    try {
      const response = await fetch(`/api/attempts/${attemptId}/submit`, { method: "POST" });
      // 409 ATTEMPT_EXPIRED tetap membawa hasil penilaian dari autosave —
      // halaman hasil menampilkannya.
      if (response.ok || response.status === 409) {
        router.push(`/percobaan/${attemptId}/hasil`);
        router.refresh();
        return;
      }
      const error = (await readError(response)) as EnvelopeError | null;
      toast({
        title: "Submit gagal",
        description: error?.error.message ?? "Coba lagi beberapa saat.",
        variant: "danger",
      });
    } catch {
      toast({
        title: "Submit gagal",
        description: "Periksa koneksi Anda, lalu coba lagi.",
        variant: "danger",
      });
    } finally {
      setMenSubmit(false);
    }
  };

  // ---------------------------------------------------------------- timer
  // Selisih jam dihitung setelah mount: timer selalu memakai waktu server.
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

  const kirim = React.useCallback(
    async (payload: { pertanyaan_id: string; opsi_id: string }) => {
      const response = await fetch(`/api/attempts/${attemptId}/answers`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = (await readError(response)) as EnvelopeError | null;
        throw new Error(error?.error.message ?? "Gagal menyimpan jawaban.");
      }
      return response.json();
    },
    [attemptId],
  );

  /** Coba kirim seluruh antrian; yang gagal dijadwalkan ulang dengan backoff. */
  const flushRef = React.useRef<() => Promise<void>>(async () => {});
  const flush = React.useCallback(async () => {
    if (antreRef.current.size === 0 || mengirim) return;
    setMengirim(true);
    setStatusSimpan("menyimpan");

    for (const [pertanyaanId, item] of [...antreRef.current.entries()]) {
      try {
        await kirim(item);
        antreRef.current.delete(pertanyaanId);
        const retry = timerRetryRef.current.get(pertanyaanId);
        if (retry) {
          clearTimeout(retry);
          timerRetryRef.current.delete(pertanyaanId);
        }
        setJumlahMenunggu(antreRef.current.size);
        setStatusSimpan(antreRef.current.size > 0 ? "menyimpan" : "tersimpan");
      } catch {
        item.percobaan += 1;
        const jeda = BACKOFF_DETIK[Math.min(item.percobaan - 1, BACKOFF_DETIK.length - 1)] ?? 30;
        setStatusSimpan(navigator.onLine ? "mencoba-lagi" : "menunggu");
        const existing = timerRetryRef.current.get(pertanyaanId);
        if (existing) clearTimeout(existing);
        timerRetryRef.current.set(
          pertanyaanId,
          setTimeout(() => void flushRef.current(), jeda * 1000),
        );
        setJumlahMenunggu(antreRef.current.size);
        return; // coba lagi di jadwal berikutnya
      }
    }

    setMengirim(false);
  }, [kirim, mengirim]);

  React.useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Saat koneksi kembali, segera coba sinkronkan antrian.
  React.useEffect(() => {
    const onOnline = () => void flushRef.current();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  React.useEffect(() => {
    const timers = timerRetryRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const pilihOpsi = (pertanyaanId: string, opsiId: string) => {
    setJawaban((prev) => ({ ...prev, [pertanyaanId]: opsiId })); // optimistik
    antreRef.current.set(pertanyaanId, { pertanyaan_id: pertanyaanId, opsi_id: opsiId, percobaan: 0 });
    setJumlahMenunggu(antreRef.current.size);
    setStatusSimpan(navigator.onLine ? "menyimpan" : "menunggu");
    void flush();
  };

  // ---------------------------------------------------------------- urutan
  const urutanSoal = React.useMemo(() => {
    const daftar = acak.soal?.length ? [...acak.soal] : soal.map((s) => s.id);
    return daftar.map((id) => soal.find((s) => s.id === id)).filter((s): s is SoalRuang => Boolean(s));
  }, [acak.soal, soal]);

  const soalAktif = urutanSoal[Math.min(indexSoal, urutanSoal.length - 1)];

  const opsiTerurut = React.useMemo(() => {
    if (!soalAktif) return [];
    const dasar = [...soalAktif.opsi].sort((a, b) => a.urutan - b.urutan);
    const urutan = acak.opsi?.[soalAktif.id];
    if (!urutan?.length) return dasar;
    return urutan.map((id) => dasar.find((o) => o.id === id)).filter((o) => Boolean(o));
  }, [acak.opsi, soalAktif]);

  const belumTerjawab = urutanSoal.filter((s) => !jawaban[s.id]).length;
  const adaBelumTersimpan = jumlahMenunggu > 0;

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
        <div className="flex items-center gap-3">
          <span
            role="status"
            className={`text-xs ${
              adaBelumTersimpan
                ? "text-amber-600 dark:text-amber-400"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            {statusSimpan === "menyimpan" && "Menyimpan…"}
            {statusSimpan === "menunggu" && "Menunggu koneksi…"}
            {statusSimpan === "mencoba-lagi" && "Mencoba lagi…"}
            {statusSimpan === "tersimpan" && "Tersimpan"}
            {statusSimpan === "idle" && ""}
          </span>
          <p
            role="timer"
            className={`font-mono text-lg font-semibold tabular-nums ${
              sisa <= 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-50"
            }`}
          >
            {sisa <= 0 ? "Waktu habis" : formatWaktu(sisa)}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{soalAktif.teks}</CardTitle>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {soalAktif.tipe === "boolean" ? "Benar / salah" : "Pilihan ganda"} · bobot {soalAktif.bobot}
          </p>
        </CardHeader>
        <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label="Pilihan jawaban">
          {opsiTerurut.map((opsi, index) => {
            const terpilih = opsi ? jawaban[soalAktif.id] === opsi.id : false;
            return (
              <button
                key={opsi?.id ?? index}
                type="button"
                role="radio"
                aria-checked={terpilih}
                onClick={() => opsi && pilihOpsi(soalAktif.id, opsi.id)}
                className={`min-h-11 rounded-lg border px-3 py-2.5 text-left text-sm ${
                  terpilih
                    ? "border-teal-600 bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-100"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {opsi?.teks}
              </button>
            );
          })}
        </div>
      </Card>

      <nav className="flex flex-wrap gap-2" aria-label="Navigasi soal">
        {urutanSoal.map((item, index) => {
          const terjawab = Boolean(jawaban[item.id]);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setIndexSoal(index)}
              aria-current={index === indexSoal ? "true" : undefined}
              aria-label={`Soal ${index + 1}${terjawab ? " (terjawab)" : " (belum dijawab)"}`}
              className={`relative min-h-9 min-w-9 rounded-lg border text-sm font-medium ${
                index === indexSoal
                  ? "border-teal-600 bg-teal-600 text-white"
                  : terjawab
                    ? "border-teal-300 text-teal-700 dark:border-teal-800 dark:text-teal-300"
                    : "border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              }`}
            >
              {index + 1}
              {terjawab ? null : (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500"
                />
              )}
            </button>
          );
        })}
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

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {belumTerjawab === 0
            ? "Semua soal telah dijawab."
            : `${belumTerjawab} soal belum dijawab.`}
        </p>
        <Button
          disabled={adaBelumTersimpan || sisa <= 0}
          loading={menSubmit}
          onClick={() => void onSubmit()}
        >
          Submit
        </Button>
      </div>
    </main>
  );
}
