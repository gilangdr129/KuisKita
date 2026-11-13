import {
  bandingkanHasil,
  durasiMs,
  hitungNilai,
  urutkanPeringkat,
} from "@/lib/attempts/skor";
import { describe, expect, it } from "vitest";

const soal = [
  { id: "s1", bobot: 2 },
  { id: "s2", bobot: 1 },
  { id: "s3", bobot: 1 },
];

const kunci = [
  { pertanyaan_id: "s1", opsi_id: "s1-opsi-2" },
  { pertanyaan_id: "s2", opsi_id: "s2-opsi-1" },
  { pertanyaan_id: "s3", opsi_id: "s3-opsi-1" },
];

describe("hitungNilai (skor berbobot)", () => {
  it("semua benar → skor penuh & 100%", () => {
    const hasil = hitungNilai({
      soal,
      jawaban: [
        { pertanyaan_id: "s1", opsi_id: "s1-opsi-2" },
        { pertanyaan_id: "s2", opsi_id: "s2-opsi-1" },
        { pertanyaan_id: "s3", opsi_id: "s3-opsi-1" },
      ],
      kunci,
    });
    expect(hasil.skor).toBe(4);
    expect(hasil.persentase).toBe(100);
    expect(hasil.benar).toBe(3);
    expect(hasil.salah).toBe(0);
    expect(hasil.total_soal).toBe(3);
    expect(hasil.total_bobot).toBe(4);
  });

  it("bobot diperhitungkan: benar di soal bobot 2, salah di bobot 1 → 66.67%", () => {
    const hasil = hitungNilai({
      soal,
      jawaban: [
        { pertanyaan_id: "s1", opsi_id: "s1-opsi-2" },
        { pertanyaan_id: "s2", opsi_id: "s2-opsi-salah" },
        { pertanyaan_id: "s3", opsi_id: "s3-opsi-salah" },
      ],
      kunci,
    });
    expect(hasil.skor).toBe(2);
    expect(hasil.persentase).toBe(50);
    expect(hasil.benar).toBe(1);
    expect(hasil.salah).toBe(2);
  });

  it("persentase membulat 2 desimal", () => {
    const hasil = hitungNilai({
      soal: [
        { id: "a", bobot: 1 },
        { id: "b", bobot: 1 },
        { id: "c", bobot: 1 },
      ],
      jawaban: [{ pertanyaan_id: "a", opsi_id: "a-benar" }],
      kunci: [
        { pertanyaan_id: "a", opsi_id: "a-benar" },
        { pertanyaan_id: "b", opsi_id: "b-benar" },
        { pertanyaan_id: "c", opsi_id: "c-benar" },
      ],
    });
    expect(hasil.persentase).toBe(33.33);
  });

  it("tidak ada jawaban → skor 0", () => {
    const hasil = hitungNilai({ soal, jawaban: [], kunci });
    expect(hasil.skor).toBe(0);
    expect(hasil.persentase).toBe(0);
    expect(hasil.benar).toBe(0);
  });

  it("jawaban yang salah dihitung salah, bukan dibuang", () => {
    const hasil = hitungNilai({
      soal,
      jawaban: [{ pertanyaan_id: "s1", opsi_id: "s1-opsi-salah" }],
      kunci,
    });
    expect(hasil.benar).toBe(0);
    expect(hasil.salah).toBe(1);
  });

  it("total bobot 0 (semua bobot 0) tidak membagi nol", () => {
    const hasil = hitungNilai({
      soal: [{ id: "z", bobot: 0 }],
      jawaban: [{ pertanyaan_id: "z", opsi_id: "z-benar" }],
      kunci: [{ pertanyaan_id: "z", opsi_id: "z-benar" }],
    });
    expect(hasil.persentase).toBe(0);
    expect(hasil.total_bobot).toBe(0);
  });
});

describe("urutkanPeringkat (FR-L1)", () => {
  it("skor desc, lalu durasi tercepat sebagai tie-break", () => {
    const urut = urutkanPeringkat([
      { attempt_id: "a", skor: 50, durasi_ms: 300 },
      { attempt_id: "b", skor: 100, durasi_ms: 900 },
      { attempt_id: "c", skor: 100, durasi_ms: 400 },
      { attempt_id: "d", skor: 100, durasi_ms: 400 },
    ]);
    expect(urut.map((b) => b.attempt_id)).toEqual(["c", "d", "b", "a"]);
  });

  it("tidak memutasi array masukan", () => {
    const asal = [
      { attempt_id: "a", skor: 10, durasi_ms: 10 },
      { attempt_id: "b", skor: 20, durasi_ms: 20 },
    ];
    urutkanPeringkat(asal);
    expect(asal[0]?.attempt_id).toBe("a");
  });
});

describe("durasiMs", () => {
  it("selisih milidetik, minimal 0", () => {
    const mulai = new Date("2026-01-01T00:00:00.000Z");
    expect(durasiMs(mulai, new Date("2026-01-01T00:00:42.500Z"))).toBe(42500);
    expect(durasiMs(new Date("2026-01-01T00:00:10Z"), new Date("2026-01-01T00:00:01Z"))).toBe(0);
  });
});

describe("bandingkanHasil (drift detector)", () => {
  it("kosong bila RPC cocok dengan rumus", () => {
    expect(
      bandingkanHasil(
        { skor: 4, persentase: 100, benar: 3, salah: 0, total_soal: 3 },
        hitungNilai({
          soal,
          jawaban: [
            { pertanyaan_id: "s1", opsi_id: "s1-opsi-2" },
            { pertanyaan_id: "s2", opsi_id: "s2-opsi-1" },
            { pertanyaan_id: "s3", opsi_id: "s3-opsi-1" },
          ],
          kunci,
        }),
      ),
    ).toEqual([]);
  });

  it("melaporkan selisih bobot", () => {
    const selisih = bandingkanHasil(
      { skor: 99, persentase: 100, benar: 3, salah: 0, total_soal: 3 },
      hitungNilai({
        soal,
        jawaban: [
          { pertanyaan_id: "s1", opsi_id: "s1-opsi-2" },
          { pertanyaan_id: "s2", opsi_id: "s2-opsi-1" },
          { pertanyaan_id: "s3", opsi_id: "s3-opsi-1" },
        ],
        kunci,
      }),
    );
    expect(selisih).toEqual(["skor: rpc=99 rujukan=4"]);
  });
});
