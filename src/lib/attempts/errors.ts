import { z } from "zod";

/** Mulai percobaan untuk sebuah kuis. */
export const startAttemptSchema = z.object({
  quiz_id: z.string().uuid("ID kuis tidak valid"),
});

export const attemptIdSchema = z.string().uuid("ID percobaan tidak valid");

/** Kode error dari RPC percobaan → status & pesan envelope. */
const RPC_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  AUTH_REQUIRED: {
    status: 401,
    code: "UNAUTHORIZED",
    message: "Anda harus masuk untuk mengerjakan kuis.",
  },
  QUIZ_NOT_FOUND: {
    status: 404,
    code: "QUIZ_NOT_FOUND",
    message: "Kuis tidak ditemukan atau sudah tidak tersedia.",
  },
  QUIZ_NOT_PUBLISHED: {
    status: 409,
    code: "QUIZ_NOT_PUBLISHED",
    message: "Kuis ini belum terbit.",
  },
  MAX_ATTEMPTS_REACHED: {
    status: 409,
    code: "MAX_ATTEMPTS_REACHED",
    message: "Batas jumlah percobaan untuk kuis ini sudah tercapai.",
  },
  ATTEMPT_NOT_FOUND: {
    status: 404,
    code: "ATTEMPT_NOT_FOUND",
    message: "Percobaan tidak ditemukan.",
  },
  ATTEMPT_EXPIRED: {
    status: 409,
    code: "ATTEMPT_EXPIRED",
    message: "Waktu pengerjaan sudah habis. Jawaban tidak lagi dapat disimpan.",
  },
  ATTEMPT_FINAL: {
    status: 409,
    code: "ATTEMPT_FINAL",
    message: "Percobaan ini sudah selesai.",
  },
  OPTION_MISMATCH: {
    status: 400,
    code: "OPTION_MISMATCH",
    message: "Opsi tidak cocok dengan soal yang dikerjakan.",
  },
};

/** Ekstrak kode error RPC dari pesan Supabase (kode di-inline di pesan). */
export function mapRpcError(error: unknown) {
  const message = (error as { message?: string } | null)?.message ?? "";
  for (const [code, mapped] of Object.entries(RPC_ERRORS)) {
    if (message.includes(code)) return mapped;
  }
  return {
    status: 400,
    code: "ATTEMPT_RPC_ERROR",
    message: message || "Gagal memproses percobaan.",
  };
}
