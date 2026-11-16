"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/kuis/status-badge";
import type { SoalEditor } from "@/lib/creator/soal";
import { MAKS_OPSI } from "@/lib/validation/schemas";

/** Soal draf di form: kunci disimpan sebagai indeks opsi terpilih. */
type SoalDraf = {
  teks: string;
  tipe: "single" | "boolean";
  bobot: string;
  pembahasan: string;
  gambar_url: string | null;
  opsi: { teks: string }[];
  kunciIndex: number | null;
};

const TIPE_LABEL: Record<string, string> = {
  single: "Pilihan ganda",
  boolean: "Benar / salah",
};

function dariSoalEditor(soal: SoalEditor[]): SoalDraf[] {
  return soal.map((item) => ({
    teks: item.teks,
    tipe: item.tipe === "boolean" ? "boolean" : "single",
    bobot: String(item.bobot),
    pembahasan: item.pembahasan,
    gambar_url: item.gambar_url,
    opsi: item.opsi.map((o) => ({ teks: o.teks })),
    kunciIndex: item.opsi.findIndex((o) => o.id === item.opsi_benar_id),
  }));
}

function soalBaru(): SoalDraf {
  return {
    teks: "",
    tipe: "single",
    bobot: "1",
    pembahasan: "",
    gambar_url: null,
    opsi: [{ teks: "" }, { teks: "" }],
    kunciIndex: null,
  };
}

function tukar<T>(daftar: T[], i: number, j: number): T[] {
  if (i < 0 || j < 0 || i >= daftar.length || j >= daftar.length) return daftar;
  const hasil = [...daftar];
  const a = hasil[i] as T;
  const b = hasil[j] as T;
  hasil[i] = b;
  hasil[j] = a;
  return hasil;
}

type Props = {
  quizId: string;
  statusKuis: string;
  soalAwal: SoalEditor[];
};

/**
 * Editor soal: tambah/urutkan (tombol naik-turun, dapat diakses keyboard),
 * opsi + kunci (radio), unggah gambar per soal, lalu simpan struktur dan
 * kunci lewat endpoint terpisah (kunci dikirim sebagai question_id+option_id).
 */
export function EditorSoal({ quizId, statusKuis, soalAwal }: Props) {
  const router = useRouter();
  const [daftar, setDaftar] = React.useState<SoalDraf[]>(() =>
    soalAwal.length > 0 ? dariSoalEditor(soalAwal) : [soalBaru()],
  );
  const [pesan, setPesan] = React.useState<{ jenis: "sukses" | "galat"; teks: string } | null>(null);
  const [menyimpan, setMenyimpan] = React.useState(false);
  const [menerbitkan, setMenerbitkan] = React.useState(false);
  const [mengunggah, setMengunggah] = React.useState<number | null>(null);
  const [tautanPratinjau, setTautanPratinjau] = React.useState<string | null>(null);

  const ubahSoal = (index: number, perubahan: Partial<SoalDraf>) => {
    setDaftar((prev) => prev.map((item, i) => (i === index ? { ...item, ...perubahan } : item)));
  };

  const ubahOpsi = (indexSoal: number, indexOpsi: number, teks: string) => {
    setDaftar((prev) =>
      prev.map((soal, i) =>
        i === indexSoal
          ? { ...soal, opsi: soal.opsi.map((opsi, j) => (j === indexOpsi ? { teks } : opsi)) }
          : soal,
      ),
    );
  };

  const tambahOpsi = (indexSoal: number) => {
    setDaftar((prev) =>
      prev.map((soal, i) =>
        i === indexSoal && soal.opsi.length < MAKS_OPSI
          ? { ...soal, opsi: [...soal.opsi, { teks: "" }] }
          : soal,
      ),
    );
  };

  const hapusOpsi = (indexSoal: number, indexOpsi: number) => {
    setDaftar((prev) =>
      prev.map((soal, i) => {
        if (i !== indexSoal) return soal;
        const opsi = soal.opsi.filter((_, j) => j !== indexOpsi);
        const kunciIndex =
          soal.kunciIndex == null
            ? null
            : soal.kunciIndex === indexOpsi
              ? null
              : soal.kunciIndex > indexOpsi
                ? soal.kunciIndex - 1
                : soal.kunciIndex;
        return { ...soal, opsi, kunciIndex };
      }),
    );
  };

  const unggahGambar = async (indexSoal: number, berkas: File | null) => {
    if (!berkas) return;
    setMengunggah(indexSoal);
    setPesan(null);

    const form = new FormData();
    form.append("tujuan", "soal");
    form.append("file", berkas);

    const response = await fetch("/api/uploads", { method: "POST", body: form });
    if (response.ok) {
      const data = (await response.json()) as { data?: { url?: string } };
      if (data.data?.url) {
        ubahSoal(indexSoal, { gambar_url: data.data.url });
        setPesan({ jenis: "sukses", teks: "Gambar soal terunggah." });
      } else {
        setPesan({ jenis: "galat", teks: "Respons unggah tidak lengkap." });
      }
    } else {
      const isi = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setPesan({ jenis: "galat", teks: isi?.error?.message ?? "Gagal mengunggah gambar." });
    }
    setMengunggah(null);
  };

  const validasiLokal = (): string | null => {
    if (daftar.length === 0) return "Tambahkan minimal satu soal sebelum menyimpan.";
    for (const [i, soal] of daftar.entries()) {
      const nama = `Soal ${i + 1}`;
      if (soal.teks.trim().length === 0) return `${nama}: teks soal wajib diisi.`;
      if (soal.opsi.length < 2) return `${nama}: minimal 2 opsi.`;
      if (soal.opsi.length > MAKS_OPSI) return `${nama}: maksimal ${MAKS_OPSI} opsi.`;
      if (soal.tipe === "boolean" && soal.opsi.length !== 2)
        return `${nama}: soal benar/salah harus punya tepat 2 opsi.`;
      if (soal.opsi.some((opsi) => opsi.teks.trim().length === 0))
        return `${nama}: teks setiap opsi wajib diisi.`;
      const bobot = Number(soal.bobot);
      if (!Number.isFinite(bobot) || bobot < 0) return `${nama}: bobot harus angka >= 0.`;
      if (soal.kunciIndex == null) return `${nama}: pilih kunci jawaban (opsi benar).`;
    }
    return null;
  };

  const simpan = async (): Promise<boolean> => {
    const galat = validasiLokal();
    if (galat) {
      setPesan({ jenis: "galat", teks: galat });
      return false;
    }

    setMenyimpan(true);
    setPesan(null);

    // 1) Struktur soal + opsi (urutan = posisi array).
    const responsSoal = await fetch(`/api/creator/quizzes/${quizId}/questions`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        soal: daftar.map((soal) => ({
          teks: soal.teks.trim(),
          tipe: soal.tipe,
          bobot: Number(soal.bobot),
          pembahasan: soal.pembahasan.trim(),
          gambar_url: soal.gambar_url,
          opsi: soal.opsi.map((opsi) => ({ teks: opsi.teks.trim() })),
        })),
      }),
    });

    if (!responsSoal.ok) {
      const isi = (await responsSoal.json().catch(() => null)) as { error?: { message?: string } } | null;
      setPesan({ jenis: "galat", teks: isi?.error?.message ?? "Gagal menyimpan soal." });
      setMenyimpan(false);
      return false;
    }

    const hasilSoal = (await responsSoal.json()) as {
      data?: { soal?: { id: string; opsi: { id: string }[] }[] };
    };

    // 2) Kunci jawaban per soal (question_id + option_id dari langkah 1).
    const soalTersimpan = hasilSoal.data?.soal ?? [];
    let kunciGagal: string | null = null;

    for (const [index, soal] of daftar.entries()) {
      if (soal.kunciIndex == null) continue;
      const tersimpan = soalTersimpan[index];
      const opsiTersimpan = tersimpan?.opsi?.[soal.kunciIndex];
      if (!tersimpan || !opsiTersimpan) {
        kunciGagal = `Soal ${index + 1}: struktur tidak kembali dari server.`;
        break;
      }

      const responsKunci = await fetch(`/api/creator/quizzes/${quizId}/kunci`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question_id: tersimpan.id, option_id: opsiTersimpan.id }),
      });

      if (!responsKunci.ok) {
        const isi = (await responsKunci.json().catch(() => null)) as { error?: { message?: string } } | null;
        kunciGagal = isi?.error?.message ?? "Gagal menyimpan kunci jawaban.";
        break;
      }
    }

    setMenyimpan(false);
    if (kunciGagal) {
      setPesan({ jenis: "galat", teks: kunciGagal });
      return false;
    }

    setPesan({ jenis: "sukses", teks: "Soal dan kunci jawaban tersimpan." });
    router.refresh();
    return true;
  };

  const buatPratinjau = async () => {
    setPesan(null);
    const response = await fetch(`/api/creator/quizzes/${quizId}/preview-token`, { method: "POST" });
    if (!response.ok) {
      const isi = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setPesan({ jenis: "galat", teks: isi?.error?.message ?? "Gagal membuat tautan pratinjau." });
      return;
    }
    const data = (await response.json()) as { data?: { url?: string } };
    if (data.data?.url) {
      setTautanPratinjau(data.data.url);
      window.open(data.data.url, "_blank", "noopener,noreferrer");
    }
  };

  /** Terbitkan: simpan dulu (struktur + kunci), baru POST publish. */
  const terbitkan = async () => {
    const galat = validasiLokal();
    if (galat) {
      setPesan({ jenis: "galat", teks: `Perbaiki dulu sebelum terbit — ${galat}` });
      return;
    }

    setMenerbitkan(true);
    setPesan(null);

    // Simpan struktur + kunci lebih dulu agar validasi terbit melihat data terbaru.
    const tersimpan = await simpan();
    if (!tersimpan) {
      setMenerbitkan(false);
      return;
    }

    const response = await fetch(`/api/creator/quizzes/${quizId}/publish`, { method: "POST" });
    setMenerbitkan(false);

    if (response.ok) {
      const data = (await response.json()) as { data?: { published_at?: string } };
      setPesan({
        jenis: "sukses",
        teks: `Kuis terbit dan langsung tampil di katalog (${data.data?.published_at ?? "sekarang"}).`,
      });
      router.refresh();
      return;
    }

    const isi = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    // Pesan dari RPC sudah spesifik per soal (daftar dipisah "; ").
    setPesan({
      jenis: "galat",
      teks: isi?.error?.message ?? "Gagal menerbitkan kuis.",
    });
  };

  const kelasInput =
    "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50";
  const kelasTombolKecil =
    "inline-flex min-h-9 items-center rounded-md border border-slate-300 px-2 text-xs dark:border-slate-700";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={statusKuis} />
        <Button onClick={() => void simpan()} loading={menyimpan}>
          Simpan soal & kunci
        </Button>
        {statusKuis !== "published" ? (
          <Button variant="primary" onClick={() => void terbitkan()} loading={menerbitkan}>
            Terbitkan
          </Button>
        ) : (
          <span className="text-xs font-medium text-teal-700 dark:text-teal-300">
            Sudah terbit — tampil di katalog publik.
          </span>
        )}
        <Button variant="secondary" onClick={() => void buatPratinjau()}>
          Pratinjau
        </Button>
        <Button
          variant="ghost"
          onClick={() => setDaftar((prev) => [...prev, soalBaru()])}
        >
          Tambah soal
        </Button>
        {tautanPratinjau ? (
          <a href={tautanPratinjau} target="_blank" rel="noreferrer" className="text-xs underline">
            Buka pratinjau lagi
          </a>
        ) : null}
      </div>

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

      {daftar.map((soal, indexSoal) => (
        <Card key={indexSoal}>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">Soal {indexSoal + 1}</CardTitle>
              <CardDescription>{TIPE_LABEL[soal.tipe] ?? soal.tipe}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                className={kelasTombolKecil}
                aria-label={`Naikkan soal ${indexSoal + 1}`}
                disabled={indexSoal === 0}
                onClick={() => setDaftar((prev) => tukar(prev, indexSoal, indexSoal - 1))}
              >
                ↑
              </button>
              <button
                type="button"
                className={kelasTombolKecil}
                aria-label={`Turunkan soal ${indexSoal + 1}`}
                disabled={indexSoal === daftar.length - 1}
                onClick={() => setDaftar((prev) => tukar(prev, indexSoal, indexSoal + 1))}
              >
                ↓
              </button>
              <button
                type="button"
                className={kelasTombolKecil}
                aria-label={`Hapus soal ${indexSoal + 1}`}
                onClick={() => setDaftar((prev) => prev.filter((_, i) => i !== indexSoal))}
              >
                Hapus
              </button>
            </div>
          </CardHeader>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Teks soal</span>
              <textarea
                rows={3}
                maxLength={1000}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
                value={soal.teks}
                onChange={(event) => ubahSoal(indexSoal, { teks: event.target.value })}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Tipe</span>
                <select
                  className={kelasInput}
                  value={soal.tipe}
                  onChange={(event) => {
                    const tipe = event.target.value as "single" | "boolean";
                    const opsi =
                      tipe === "boolean"
                        ? soal.opsi.slice(0, 2).length === 2
                          ? soal.opsi.slice(0, 2)
                          : [{ teks: "Benar" }, { teks: "Salah" }]
                        : soal.opsi;
                    ubahSoal(indexSoal, {
                      tipe,
                      opsi,
                      kunciIndex: tipe === "boolean" && (soal.kunciIndex ?? 0) > 1 ? 0 : soal.kunciIndex,
                    });
                  }}
                >
                  <option value="single">Pilihan ganda</option>
                  <option value="boolean">Benar / salah</option>
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Bobot</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={kelasInput}
                  value={soal.bobot}
                  onChange={(event) => ubahSoal(indexSoal, { bobot: event.target.value })}
                />
              </label>

              <div className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-200">Gambar soal</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="text-xs"
                  onChange={(event) => void unggahGambar(indexSoal, event.target.files?.[0] ?? null)}
                />
                {mengunggah === indexSoal ? (
                  <span className="text-xs text-slate-500">Mengunggah…</span>
                ) : null}
              </div>
            </div>

            {soal.gambar_url ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau gambar dari Storage Supabase */}
                <img
                  src={soal.gambar_url}
                  alt={`Gambar soal ${indexSoal + 1}`}
                  className="max-h-32 rounded-lg border border-slate-200 object-contain dark:border-slate-800"
                />
                <button
                  type="button"
                  className={kelasTombolKecil}
                  onClick={() => ubahSoal(indexSoal, { gambar_url: null })}
                >
                  Hapus gambar
                </button>
              </div>
            ) : null}

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Opsi (pilih salah satu sebagai kunci jawaban)
              </legend>
              {soal.opsi.map((opsi, indexOpsi) => (
                <div key={indexOpsi} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`kunci-${quizId}-${indexSoal}`}
                    checked={soal.kunciIndex === indexOpsi}
                    onChange={() => ubahSoal(indexSoal, { kunciIndex: indexOpsi })}
                    aria-label={`Jadikan opsi ${indexOpsi + 1} kunci jawaban soal ${indexSoal + 1}`}
                  />
                  <input
                    type="text"
                    className={kelasInput}
                    value={opsi.teks}
                    maxLength={500}
                    placeholder={`Opsi ${indexOpsi + 1}`}
                    onChange={(event) => ubahOpsi(indexSoal, indexOpsi, event.target.value)}
                  />
                  <button
                    type="button"
                    className={kelasTombolKecil}
                    aria-label={`Naikkan opsi ${indexOpsi + 1} soal ${indexSoal + 1}`}
                    disabled={indexOpsi === 0}
                    onClick={() =>
                      setDaftar((prev) =>
                        prev.map((item, i) =>
                          i === indexSoal
                            ? {
                                ...item,
                                opsi: tukar(item.opsi, indexOpsi, indexOpsi - 1),
                                kunciIndex:
                                  item.kunciIndex === indexOpsi
                                    ? indexOpsi - 1
                                    : item.kunciIndex === indexOpsi - 1
                                      ? indexOpsi
                                      : item.kunciIndex,
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={kelasTombolKecil}
                    aria-label={`Turunkan opsi ${indexOpsi + 1} soal ${indexSoal + 1}`}
                    disabled={indexOpsi === soal.opsi.length - 1}
                    onClick={() =>
                      setDaftar((prev) =>
                        prev.map((item, i) =>
                          i === indexSoal
                            ? {
                                ...item,
                                opsi: tukar(item.opsi, indexOpsi, indexOpsi + 1),
                                kunciIndex:
                                  item.kunciIndex === indexOpsi
                                    ? indexOpsi + 1
                                    : item.kunciIndex === indexOpsi + 1
                                      ? indexOpsi
                                      : item.kunciIndex,
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={kelasTombolKecil}
                    aria-label={`Hapus opsi ${indexOpsi + 1} soal ${indexSoal + 1}`}
                    disabled={soal.opsi.length <= 2}
                    onClick={() => hapusOpsi(indexSoal, indexOpsi)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={soal.opsi.length >= MAKS_OPSI}
                  onClick={() => tambahOpsi(indexSoal)}
                >
                  Tambah opsi
                </Button>
              </div>
            </fieldset>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">
                Pembahasan (tampil setelah attempt disubmit)
              </span>
              <textarea
                rows={2}
                maxLength={2000}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
                value={soal.pembahasan}
                onChange={(event) => ubahSoal(indexSoal, { pembahasan: event.target.value })}
              />
            </label>
          </div>
        </Card>
      ))}
    </div>
  );
}