import {
  forgotPasswordSchema,
  quizCreateSchema,
  quizUpdateSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "@/lib/validation/schemas";
import { describe, expect, it } from "vitest";

describe("skema auth", () => {
  it("menerima pendaftaran yang valid dan menormalkan email", () => {
    const result = signUpSchema.safeParse({
      email: "Rani@Contoh.co.id",
      username: "rani_01",
      password: "rahasia-uji-123",
      konfirmasi: "rahasia-uji-123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("rani@contoh.co.id");
    }
  });

  it("menolak konfirmasi password yang tidak sama", () => {
    const result = signUpSchema.safeParse({
      email: "rani@contoh.co.id",
      username: "rani_01",
      password: "rahasia-uji-123",
      konfirmasi: "beda-sekali",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["konfirmasi"]);
    }
  });

  it("menolak password terlalu pendek dan username tidak valid", () => {
    expect(signUpSchema.safeParse({
      email: "rani@contoh.co.id", username: "RA", password: "123", konfirmasi: "123",
    }).success).toBe(false);
  });

  it("membutuhkan password pada skema masuk", () => {
    expect(signInSchema.safeParse({ email: "rani@contoh.co.id", password: "" }).success).toBe(false);
  });

  it("skema lupa-sandi dan perbarui-sandi bekerja", () => {
    expect(forgotPasswordSchema.safeParse({ email: "rani@contoh.co.id" }).success).toBe(true);
    expect(
      updatePasswordSchema.safeParse({ password: "rahasia-baru-1", konfirmasi: "rahasia-baru-2" }).success,
    ).toBe(false);
    expect(
      updatePasswordSchema.safeParse({ password: "rahasia-baru-1", konfirmasi: "rahasia-baru-1" }).success,
    ).toBe(true);
  });
});

describe("skema kuis kreator (F12)", () => {
  const valid = {
    judul: "Kuis Sains SD",
    deskripsi: "Kuis percobaan",
    durasi_detik: 600,
    kesulitan: "easy",
  };

  it("menerima kuis valid dan mengisi default", () => {
    const result = quizCreateSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deskripsi).toBe("Kuis percobaan");
      expect(result.data.acak_soal).toBe(false);
      expect(result.data.acak_opsi).toBe(false);
      expect(result.data.visibilitas).toBe("public");
      expect(result.data.kategori).toBeUndefined();
      expect(result.data.maks_percobaan).toBeUndefined();
    }
  });

  it("menerima kategori dan maks_percobaan opsional", () => {
    const result = quizCreateSchema.safeParse({
      ...valid,
      kategori: "sains",
      maks_percobaan: 3,
      acak_soal: true,
      visibilitas: "unlisted",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kategori).toBe("sains");
      expect(result.data.maks_percobaan).toBe(3);
      expect(result.data.acak_soal).toBe(true);
      expect(result.data.visibilitas).toBe("unlisted");
    }
  });

  it("menerima kategori null (tanpa kategori) dan maks_percobaan null (tanpa batas)", () => {
    const result = quizCreateSchema.safeParse({ ...valid, kategori: null, maks_percobaan: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kategori).toBeNull();
      expect(result.data.maks_percobaan).toBeNull();
    }
  });

  it("menegakkan batas karakter judul 3–120", () => {
    expect(quizCreateSchema.safeParse({ ...valid, judul: "ab" }).success).toBe(false);
    expect(quizCreateSchema.safeParse({ ...valid, judul: "a".repeat(121) }).success).toBe(false);
    expect(quizCreateSchema.safeParse({ ...valid, judul: "abc" }).success).toBe(true);
    expect(quizCreateSchema.safeParse({ ...valid, judul: "a".repeat(120) }).success).toBe(true);
  });

  it("menegakkan batas deskripsi 2000 karakter", () => {
    expect(quizCreateSchema.safeParse({ ...valid, deskripsi: "a".repeat(2001) }).success).toBe(false);
    expect(quizCreateSchema.safeParse({ ...valid, deskripsi: "a".repeat(2000) }).success).toBe(true);
  });

  it("menegakkan durasi bilangan bulat positif", () => {
    expect(quizCreateSchema.safeParse({ ...valid, durasi_detik: 0 }).success).toBe(false);
    expect(quizCreateSchema.safeParse({ ...valid, durasi_detik: -5 }).success).toBe(false);
    expect(quizCreateSchema.safeParse({ ...valid, durasi_detik: 1.5 }).success).toBe(false);
    expect(quizCreateSchema.safeParse({ ...valid, durasi_detik: "600" }).success).toBe(true);
  });

  it("menolak kesulitan/visibilitas di luar daftar dan maks_percobaan <= 0", () => {
    expect(quizCreateSchema.safeParse({ ...valid, kesulitan: "sulit" }).success).toBe(false);
    expect(quizCreateSchema.safeParse({ ...valid, visibilitas: "rahasia" }).success).toBe(false);
    expect(quizCreateSchema.safeParse({ ...valid, maks_percobaan: 0 }).success).toBe(false);
  });

  it("skema update hanya mengubah bidang yang dikirim (tanpa menimpa default)", () => {
    const result = quizUpdateSchema.safeParse({ judul: "Judul Baru" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.judul).toBe("Judul Baru");
      // Bidang tak dikirim harus undefined agar route tahu ini "tidak diubah",
      // bukan kembali ke default (deskripsi "", acak_soal false, dst).
      expect(result.data.deskripsi).toBeUndefined();
      expect(result.data.acak_soal).toBeUndefined();
      expect(result.data.visibilitas).toBeUndefined();
      expect(result.data.kategori).toBeUndefined();
    }
  });

  it("skema update menerima objek kosong dan kategori null", () => {
    expect(quizUpdateSchema.safeParse({}).success).toBe(true);
    expect(quizUpdateSchema.safeParse({ kategori: null }).success).toBe(true);
  });
});
