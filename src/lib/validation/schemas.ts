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
