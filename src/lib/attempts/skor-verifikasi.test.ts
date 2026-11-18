import { describe, expect, it } from "vitest";
import { verifikasiSkorDariDb } from "@/lib/attempts/skor";

/**
 * Regresi F18: verifikasiSkorDariDb harus memakai nama kolom database yang
 * sebenarnya (`question_id`, `option_id`), bukan nama payload klien
 * (`pertanyaan_id`, `opsi_id`). Kolom salah → rujukan selalu 0 → SKOR_DRIFT.
 */

function klienPalsu(data: Record<string, unknown[]>) {
  const panggilan: { tabel: string; kolom: string }[] = [];

  const rantai = (rows: unknown[], satuBaris?: unknown) => ({
    single: async () => ({ data: satuBaris ?? null }),
    then: (resolve: (nilai: { data: unknown[] }) => unknown) => Promise.resolve({ data: rows }).then(resolve),
  });

  return {
    panggilan,
    from(tabel: string) {
      return {
        select(kolom: string) {
          panggilan.push({ tabel, kolom });
          return {
            eq: () => rantai(data[tabel] ?? [], (data[tabel] ?? [])[0]),
          };
        },
      };
    },
  };
}

const DATA = {
  attempts: [{ quiz_id: "quiz-1" }],
  questions: [{ id: "soal-1", bobot: 2 }],
  attempt_answers: [{ question_id: "soal-1", option_id: "opsi-benar" }],
  question_keys: [{ question_id: "soal-1", option_id: "opsi-benar" }],
};

describe("verifikasiSkorDariDb (jaring pengaman F9)", () => {
  it("memakai nama kolom database yang benar", async () => {
    const klien = klienPalsu(DATA);
    await verifikasiSkorDariDb(klien as never, "attempt-1", { skor: 2 });

    const kolomJawaban = klien.panggilan.find((p) => p.tabel === "attempt_answers")?.kolom;
    const kolomKunci = klien.panggilan.find((p) => p.tabel === "question_keys")?.kolom;
    expect(kolomJawaban).toContain("question_id");
    expect(kolomJawaban).toContain("option_id");
    expect(kolomJawaban).not.toContain("pertanyaan_id");
    expect(kolomJawaban).not.toContain("opsi_id");
    expect(kolomKunci).toContain("question_id");
    expect(kolomKunci).toContain("option_id");
  });

  it("tidak ada drift bila hasil RPC cocok dengan rujukan", async () => {
    const klien = klienPalsu(DATA);
    const selisih = await verifikasiSkorDariDb(klien as never, "attempt-1", {
      skor: 2,
      persentase: 100,
      benar: 1,
      salah: 0,
      total_soal: 1,
    });
    expect(selisih).toEqual([]);
  });

  it("mendeteksi drift bila hasil RPC berbeda dengan rujukan", async () => {
    const klien = klienPalsu(DATA);
    const selisih = await verifikasiSkorDariDb(klien as never, "attempt-1", {
      skor: 0,
      persentase: 0,
      benar: 0,
      salah: 1,
      total_soal: 1,
    });
    expect(selisih.length).toBeGreaterThan(0);
  });
});