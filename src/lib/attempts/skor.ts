/**
 * Rumus penilaian KuisKita (referensi TypeScript dari RPC submit_attempt /
 * grade_attempt di SQL). Modul ini dipakai sebagai jaring pengaman di Route
 * Handler submit: bila hasil SQL dan rumus ini berbeda, ketidaksesuaian
 * dicatat (drift detector). E2E submit menguji jalur SQL sungguhan.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type SoalNilai = {
  id: string;
  bobot: number;
};

export type JawabanNilai = {
  pertanyaan_id: string;
  opsi_id: string;
};

export type KunciNilai = {
  pertanyaan_id: string;
  opsi_id: string;
};

export type RingkasanNilai = {
  skor: number;
  persentase: number;
  benar: number;
  salah: number;
  total_soal: number;
  total_bobot: number;
};

function dibulatkan(nilai: number): number {
  return Math.round(nilai * 100) / 100;
}

/** Nilai berbobot: jumlah bobot soal yang dijawab benar / total bobot kuis. */
export function hitungNilai(input: {
  soal: SoalNilai[];
  jawaban: JawabanNilai[];
  kunci: KunciNilai[];
}): RingkasanNilai {
  const kunciPerSoal = new Map(input.kunci.map((k) => [k.pertanyaan_id, k.opsi_id]));
  const bobotPerSoal = new Map(input.soal.map((s) => [s.id, s.bobot]));

  const totalBobot = input.soal.reduce((jumlah, soal) => jumlah + soal.bobot, 0);
  const totalSoal = input.soal.length;

  let skor = 0;
  let benar = 0;

  for (const jawaban of input.jawaban) {
    const bobot = bobotPerSoal.get(jawaban.pertanyaan_id) ?? 0;
    if (kunciPerSoal.get(jawaban.pertanyaan_id) === jawaban.opsi_id) {
      skor += bobot;
      benar += 1;
    }
  }

  const salah = input.jawaban.length - benar;
  const persentase = totalBobot > 0 ? dibulatkan((skor / totalBobot) * 100) : 0;

  return {
    skor: dibulatkan(skor),
    persentase,
    benar,
    salah,
    total_soal: totalSoal,
    total_bobot: dibulatkan(totalBobot),
  };
}

export type BarisPeringkat = {
  attempt_id: string;
  skor: number;
  durasi_ms: number;
};

/** Papan peringkat (FR-L1): skor desc, lalu waktu tercepat. */
export function urutkanPeringkat(baris: BarisPeringkat[]): BarisPeringkat[] {
  return [...baris].sort((a, b) => {
    if (b.skor !== a.skor) return b.skor - a.skor;
    return a.durasi_ms - b.durasi_ms;
  });
}

/** Durasi percobaan dalam ms (dipakai RPC & tampilan). */
export function durasiMs(startedAt: Date, endedAt: Date): number {
  return Math.max(0, endedAt.getTime() - startedAt.getTime());
}

/**
 * Cocokkan hasil RPC submit dengan rumus referensi. Mengembalikan daftar
 * selisih (kosong = cocok). Dipanggil route submit; selisih hanya dicatat.
 */
export function bandingkanHasil(
  hasil: {
    skor?: number | string | null;
    persentase?: number | string | null;
    benar?: number | null;
    salah?: number | null;
    total_soal?: number | null;
  },
  rujukan: RingkasanNilai,
): string[] {
  const selisih: string[] = [];
  const angka = (nilai: unknown) => (typeof nilai === "number" ? nilai : Number(nilai));

  if (Number.isFinite(angka(hasil.skor)) && angka(hasil.skor) !== rujukan.skor) {
    selisih.push(`skor: rpc=${hasil.skor} rujukan=${rujukan.skor}`);
  }
  if (Number.isFinite(angka(hasil.persentase)) && angka(hasil.persentase) !== rujukan.persentase) {
    selisih.push(`persentase: rpc=${hasil.persentase} rujukan=${rujukan.persentase}`);
  }
  if (hasil.benar != null && angka(hasil.benar) !== rujukan.benar) {
    selisih.push(`benar: rpc=${hasil.benar} rujukan=${rujukan.benar}`);
  }
  if (hasil.salah != null && angka(hasil.salah) !== rujukan.salah) {
    selisih.push(`salah: rpc=${hasil.salah} rujukan=${rujukan.salah}`);
  }
  if (hasil.total_soal != null && angka(hasil.total_soal) !== rujukan.total_soal) {
    selisih.push(`total_soal: rpc=${hasil.total_soal} rujukan=${rujukan.total_soal}`);
  }
  return selisih;
}

/**
 * Verifikasi hasil RPC submit terhadap rumus referensi memakai data dari
 * database (soal, jawaban, kunci) — mendeteksi drift antara implementasi SQL
 * dan TypeScript. Kegagalan hanya dicatat, tidak menggagalkan request.
 */
export async function verifikasiSkorDariDb(
  supabase: SupabaseClient,
  attemptId: string,
  hasil: {
    skor?: number | string | null;
    persentase?: number | string | null;
    benar?: number | null;
    salah?: number | null;
    total_soal?: number | null;
  },
): Promise<string[]> {
  const attempt = await supabase
    .from("attempts")
    .select("quiz_id")
    .eq("id", attemptId)
    .single();
  const quizId = attempt.data?.quiz_id;
  if (!quizId) return [];

  const [soal, jawaban, kunci] = await Promise.all([
    supabase.from("questions").select("id, bobot").eq("quiz_id", quizId),
    supabase.from("attempt_answers").select("pertanyaan_id, opsi_id").eq("attempt_id", attemptId),
    supabase
      .from("question_keys")
      .select("pertanyaan_id, opsi_id, questions!inner(quiz_id)")
      .eq("questions.quiz_id", quizId),
  ]);

  const rujukan = hitungNilai({
    soal: (soal.data ?? []) as SoalNilai[],
    jawaban: (jawaban.data ?? []) as JawabanNilai[],
    kunci: ((kunci.data ?? []) as (KunciNilai & { questions: unknown })[]).map((k) => ({
      pertanyaan_id: k.pertanyaan_id,
      opsi_id: k.opsi_id,
    })),
  });

  return bandingkanHasil(hasil, rujukan);
}
