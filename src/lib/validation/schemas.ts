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
  cursor: uuidSchema.optional(),
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
