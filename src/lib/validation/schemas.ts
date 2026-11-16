import { z } from "zod";

/** Skema Zod bersama yang dipakai router handler dan form (PRD §12). */

export const uuidSchema = z.string().uuid("ID tidak valid");

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{2,40}$/, "Slug hanya huruf kecil, angka, dan tanda hubung (2-40 karakter)");

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,20}$/, "Username 3-20 karakter: huruf kecil, angka, titik, underscore");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Format email tidak valid")
  .max(254, "Email terlalu panjang");

export const passwordSchema = z
  .string()
  .min(8, "Password minimal 8 karakter")
  .max(72, "Password maksimal 72 karakter");

export const searchQuerySchema = z
  .string()
  .trim()
  .min(1, "Kata pencarian minimal 1 karakter")
  .max(100, "Kata pencarian maksimal 100 karakter");

export const paginationSchema = z.object({
  cursor: z.string().max(1000, "Kursor tidak valid").optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const quizDifficultySchema = z.enum(["easy", "medium", "hard"], {
  message: "Kesulitan harus easy, medium, atau hard",
});

/** Filter katalog (dipakai GET /api/quizzes di F10). */
export const quizFiltersSchema = paginationSchema.extend({
  kategori: slugSchema.optional(),
  kesulitan: quizDifficultySchema.optional(),
  durasi: z.enum(["pendek", "sedang", "panjang"]).optional(),
  q: searchQuerySchema.optional(),
  sortir: z.enum(["terbaru", "terpopuler"]).default("terbaru"),
});

export type QuizFilters = z.infer<typeof quizFiltersSchema>;

// ============================================================
// Skema auth (F3)
// ============================================================

export const signUpSchema = z
  .object({
    email: emailSchema,
    username: usernameSchema,
    password: passwordSchema,
    konfirmasi: z.string(),
    turnstile_token: z.string().optional(),
  })
  .refine((data) => data.password === data.konfirmasi, {
    message: "Konfirmasi password tidak sama",
    path: ["konfirmasi"],
  });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password wajib diisi"),
  turnstile_token: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
  turnstile_token: z.string().optional(),
});

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    konfirmasi: z.string(),
  })
  .refine((data) => data.password === data.konfirmasi, {
    message: "Konfirmasi password tidak sama",
    path: ["konfirmasi"],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;

/** Ubah username sendiri (avatar menyusul di F5). */
export const updateUsernameSchema = z.object({
  username: usernameSchema,
});

export type UpdateUsernameInput = z.infer<typeof updateUsernameSchema>;

// ============================================================
// Skema percobaan (F7)
// ============================================================

export const startAttemptSchema = z.object({
  quiz_id: uuidSchema,
});

export const attemptIdSchema = uuidSchema;

/** Simpan satu jawaban per soal (autosave). */
export const saveAnswerSchema = z.object({
  pertanyaan_id: uuidSchema,
  opsi_id: uuidSchema,
});

// ============================================================
// Skema kuis kreator (F12)
// ============================================================

export const quizVisibilitySchema = z.enum(["public", "unlisted", "private"], {
  message: "Visibilitas harus public, unlisted, atau private",
});

/** Isi kuis baru (selalu dibuat sebagai draft; terbit = F14). */
export const judulKuisSchema = z
  .string()
  .trim()
  .min(3, "Judul minimal 3 karakter")
  .max(120, "Judul maksimal 120 karakter");

export const deskripsiKuisSchema = z
  .string()
  .trim()
  .max(2000, "Deskripsi maksimal 2000 karakter");

export const durasiKuisSchema = z.coerce
  .number()
  .int("Durasi harus bilangan bulat detik")
  .min(1, "Durasi minimal 1 detik")
  .max(86400, "Durasi maksimal 86400 detik (24 jam)");

export const maksPercobaanSchema = z.coerce
  .number()
  .int("Maksimal percobaan harus bilangan bulat")
  .min(1, "Maksimal percobaan minimal 1")
  .max(100, "Maksimal percobaan maksimal 100")
  .nullish();

export const quizCreateSchema = z.object({
  judul: judulKuisSchema,
  deskripsi: deskripsiKuisSchema.default(""),
  durasi_detik: durasiKuisSchema,
  kesulitan: quizDifficultySchema,
  /** Slug kategori; null/absen = tanpa kategori. */
  kategori: slugSchema.nullish(),
  acak_soal: z.boolean().default(false),
  acak_opsi: z.boolean().default(false),
  /** null = tanpa batas percobaan. */
  maks_percobaan: maksPercobaanSchema,
  visibilitas: quizVisibilitySchema.default("public"),
});

/**
 * Perubahan metadata kuis. Hanya bidang yang dikirim yang diubah; bidang tak
 * dikenal (termasuk status & owner) ditolak agar terbit/tangguhkan hanya lewat
 * jalur resmi (F14 / DELETE). Skema ini TIDAK memakai .partial() karena Zod 4
 * tetap menerapkan default untuk key yang absen — itu akan menimpa nilai lama.
 */
export const quizUpdateSchema = z.object({
  judul: judulKuisSchema.optional(),
  deskripsi: deskripsiKuisSchema.optional(),
  durasi_detik: durasiKuisSchema.optional(),
  kesulitan: quizDifficultySchema.optional(),
  /** null = hapus kategori. */
  kategori: slugSchema.nullish(),
  acak_soal: z.boolean().optional(),
  acak_opsi: z.boolean().optional(),
  /** null = hapus batas percobaan. */
  maks_percobaan: maksPercobaanSchema,
  visibilitas: quizVisibilitySchema.optional(),
});

export type QuizCreateInput = z.infer<typeof quizCreateSchema>;
export type QuizUpdateInput = z.infer<typeof quizUpdateSchema>;

// ============================================================
// Skema editor soal (F13)
// ============================================================

/** Maksimal opsi per soal & soal per kuis (PRD FR-P2). */
export const MAKS_OPSI = 8;
export const MAKS_SOAL = 100;

export const opsiInputSchema = z.object({
  teks: z
    .string()
    .trim()
    .min(1, "Teks opsi minimal 1 karakter")
    .max(500, "Teks opsi maksimal 500 karakter"),
});

export type OpsiInput = z.infer<typeof opsiInputSchema>;

export const soalInputSchema = z
  .object({
    teks: z
      .string()
      .trim()
      .min(1, "Teks soal minimal 1 karakter")
      .max(1000, "Teks soal maksimal 1000 karakter"),
    tipe: z.enum(["single", "boolean"], {
      message: "Tipe soal harus single atau boolean",
    }),
    bobot: z.coerce
      .number()
      .min(0, "Bobot minimal 0")
      .max(100, "Bobot maksimal 100")
      .default(1),
    pembahasan: z
      .string()
      .trim()
      .max(2000, "Pembahasan maksimal 2000 karakter")
      .default(""),
    /** URL publik dari bucket media-kuis (diunggah lewat F5). */
    gambar_url: z.string().url("URL gambar tidak valid").nullish(),
    opsi: z
      .array(opsiInputSchema)
      .min(2, "Setiap soal minimal 2 opsi")
      .max(MAKS_OPSI, `Maksimal ${MAKS_OPSI} opsi per soal`),
  })
  .refine((data) => data.tipe !== "boolean" || data.opsi.length === 2, {
    message: "Soal benar/salah harus punya tepat 2 opsi",
    path: ["opsi"],
  });

export type SoalInput = z.infer<typeof soalInputSchema>;

/** Isi PUT struktur soal: urutan = posisi array (editor menukar posisi). */
export const simpanSoalSchema = z.object({
  soal: z.array(soalInputSchema).max(MAKS_SOAL, `Maksimal ${MAKS_SOAL} soal per kuis`),
});

/** Kunci jawaban dikirim terpisah: question_id + option_id. */
export const kunciInputSchema = z.object({
  question_id: uuidSchema,
  option_id: uuidSchema,
});
