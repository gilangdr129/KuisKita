/**
 * Validasi berkas gambar (PRD FR-E3 & Gate F5): whitelist tipe lewat
 * *magic bytes* (MIME sniff), batas 2 MB, nama acak, dan ekstensi yang
 * diambil dari tipe terdeteksi (bukan dari nama berkas pengguna).
 */

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB

export const TUJUAN_UNGGAN = ["avatar", "soal"] as const;
export type TujuanUnggahan = (typeof TUJUAN_UNGGAN)[number];

const EKSTENSI: Record<DetectedType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type DetectedType = "image/jpeg" | "image/png" | "image/webp";

/** Deteksi tipe gambar dari magic bytes; null bila bukan jpg/png/webp. */
export function detectImageType(buffer: Uint8Array): DetectedType | null {
  if (buffer.length >= 12) {
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return "image/png";
    }
    // WebP: "RIFF" .... "WEBP"
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return "image/webp";
    }
  }
  return null;
}

export function extensionFor(type: DetectedType): string {
  return EKSTENSI[type];
}

/** Nama berkas acak (UUID) + ekstensi asli dari tipe terdeteksi. */
export function randomFileName(type: DetectedType): string {
  return `${crypto.randomUUID()}.${EKSTENSI[type]}`;
}

export type UploadValidation =
  | { ok: true; type: DetectedType; fileName: string }
  | { ok: false; code: string; message: string };

export function validateImageUpload(input: {
  size: number;
  buffer: Uint8Array;
}): UploadValidation {
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, code: "FILE_EMPTY", message: "Berkas kosong atau tidak terbaca." };
  }

  if (input.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: `Ukuran gambar maksimal ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
    };
  }

  const type = detectImageType(input.buffer);
  if (!type) {
    return {
      ok: false,
      code: "FILE_TYPE_NOT_ALLOWED",
      message: "Format gambar harus JPG, PNG, atau WebP.",
    };
  }

  return { ok: true, type, fileName: randomFileName(type) };
}

/** Path penyimpanan: <tujuan>/<uid>/<nama-acak> (folder pertama = uid, dipakai policy). */
export function buildStoragePath(tujuan: TujuanUnggahan, userId: string, fileName: string): string {
  return `${tujuan}/${userId}/${fileName}`;
}
