import type { NextResponse } from "next/server";
import { fail } from "@/lib/http/response";

export type RpcSoalHasil = { status: number; code: string; message: string };

/**
 * Bentuk soal untuk editor kreator. `opsi_benar_id` adalah kunci jawaban
 * milik pemilik sendiri — BUKAN tabel question_keys: tabel kunci tidak punya
 * policy/grant klien sama sekali, jadi payload editor hanya pernah memuat
 * id opsi yang benar (untuk preselect di form), tak pernah baris kunci.
 */
export type SoalEditor = {
  id: string;
  teks: string;
  tipe: string;
  bobot: number;
  urutan: number;
  pembahasan: string;
  gambar_url: string | null;
  opsi: { id: string; teks: string; urutan: number }[];
  opsi_benar_id: string | null;
};

/** Kode error dari RPC editor → status & pesan envelope. */
const RPC_ERRORS: Record<
  string,
  { status: number; code: string; message: string; /** Pakai pesan RPC (detail per soal). */ pakaiPesanRpc?: boolean }
> = {
  QUIZ_NOT_FOUND: {
    status: 404,
    code: "NOT_FOUND",
    message: "Kuis tidak ditemukan atau bukan milik Anda.",
  },
  QUESTION_NOT_FOUND: {
    status: 404,
    code: "NOT_FOUND",
    message: "Soal tidak ditemukan.",
  },
  STRUCTURE_LOCKED: {
    status: 409,
    code: "STRUCTURE_LOCKED",
    message:
      "Struktur kuis yang sudah dikerjakan tidak dapat diubah. Buat duplikat kuis untuk versi baru.",
  },
  OPTION_MISMATCH: {
    status: 400,
    code: "VALIDATION_ERROR",
    message: "Opsi bukan milik soal ini.",
  },
  OPTION_NOT_IN_QUESTION: {
    status: 400,
    code: "VALIDATION_ERROR",
    message: "Opsi bukan milik soal ini.",
  },
  SOAL_INVALID: {
    status: 400,
    code: "VALIDATION_ERROR",
    message: "Daftar soal tidak valid.",
  },
  SOAL_TERLALU_BANYAK: {
    status: 400,
    code: "VALIDATION_ERROR",
    message: "Jumlah soal melebihi batas.",
  },
  OPSI_INVALID: {
    status: 400,
    code: "VALIDATION_ERROR",
    message: "Daftar opsi tidak valid.",
  },
  OPSI_KURANG: {
    status: 400,
    code: "VALIDATION_ERROR",
    message: "Setiap soal minimal punya 2 opsi.",
  },
  OPSI_TERLALU_BANYAK: {
    status: 400,
    code: "VALIDATION_ERROR",
    message: "Maksimal 8 opsi per soal.",
  },
  OPSI_BOOLEAN: {
    status: 400,
    code: "VALIDATION_ERROR",
    message: "Soal benar/salah harus punya tepat 2 opsi.",
  },
  PREVIEW_TOKEN_INVALID: {
    status: 404,
    code: "NOT_FOUND",
    message: "Tautan pratinjau tidak valid atau sudah kedaluwarsa.",
  },
  // F14 — validasi terbit. Pesan spesifik per soal dibawa RPC (pakaiPesanRpc).
  PUBLISH_NO_QUESTIONS: {
    status: 409,
    code: "PUBLISH_NO_QUESTIONS",
    message: "Kuis harus punya minimal 1 soal sebelum terbit.",
  },
  PUBLISH_MISSING_KEYS: {
    status: 409,
    code: "PUBLISH_MISSING_KEYS",
    message: "Ada soal tanpa kunci jawaban.",
    pakaiPesanRpc: true,
  },
  PUBLISH_INVALID_OPTIONS: {
    status: 409,
    code: "PUBLISH_INVALID_OPTIONS",
    message: "Ada soal dengan opsi kurang dari 2.",
    pakaiPesanRpc: true,
  },
  PUBLISH_INVALID_IMAGE: {
    status: 409,
    code: "PUBLISH_INVALID_IMAGE",
    message: "Ada gambar soal yang bukan dari unggahan yang valid.",
    pakaiPesanRpc: true,
  },
};

/** Ambil bagian pesan setelah prefiks "KODE:" agar detail per soal terbaca. */
function pesanSetelahKode(message: string, code: string) {
  const idx = message.indexOf(code);
  if (idx === -1) return message;
  return message
    .slice(idx + code.length)
    .replace(/^:\s*/, "")
    .trim();
}

/** Petakan kesalahan RPC editor (kode di-inline di pesan exception). */
export function mapRpcSoal(error: unknown, fallbackPesan: string): RpcSoalHasil {
  const message = (error as { message?: string } | null)?.message ?? "";
  for (const [code, mapped] of Object.entries(RPC_ERRORS)) {
    if (message.includes(code)) {
      return {
        status: mapped.status,
        code: mapped.code,
        message: "pakaiPesanRpc" in mapped && mapped.pakaiPesanRpc
          ? pesanSetelahKode(message, code)
          : mapped.message,
      };
    }
  }
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: message || fallbackPesan,
  };
}

/** Bungkus hasil mapRpcSoal menjadi respons envelope lengkap. */
export function gagalRpcSoal(
  request: Request,
  error: unknown,
  fallbackPesan: string,
): NextResponse {
  const mapped = mapRpcSoal(error, fallbackPesan);
  return fail(request, mapped.status, mapped.code, mapped.message);
}

/** Kolom soal untuk editor (tanpa question_keys). */
export const SOAL_SELECT =
  "id, teks, tipe, bobot, urutan, pembahasan, gambar_url, options ( id, teks, urutan )";

/** Bentuk baris soal + opsi_benar_id menjadi SoalEditor. */
export function keSoalEditor(
  row: Record<string, unknown>,
  opsiBenarId: string | null,
): SoalEditor {
  return {
    id: String(row.id),
    teks: String(row.teks),
    tipe: String(row.tipe),
    bobot: Number(row.bobot),
    urutan: Number(row.urutan),
    pembahasan: String(row.pembahasan ?? ""),
    gambar_url: (row.gambar_url as string | null) ?? null,
    opsi: ((row.options as { id: string; teks: string; urutan: number }[] | null) ?? [])
      .slice()
      .sort((a, b) => a.urutan - b.urutan)
      .map((o) => ({ id: o.id, teks: o.teks, urutan: o.urutan })),
    opsi_benar_id: opsiBenarId,
  };
}