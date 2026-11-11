/**
 * Kompresi gambar di klien sebelum unggah (Gate F5): perkecil dimensi &
 * turunkan kualitas sampai di bawah batas, supaya unggahan dari HP tetap
 * cepat dan tidak terkena batas 2 MB server.
 */

export type CompressOptions = {
  /** Dimensi terbesar (px) setelah diperkecil. Default 1024. */
  maxDimension?: number;
  /** Batas ukuran target (byte). Default 2 MB (batas server). */
  maxBytes?: number;
  /** Kualitas awal (0-1). Default 0.82. */
  quality?: number;
};

const DEFAULTS: Required<CompressOptions> = {
  maxDimension: 1024,
  maxBytes: 2 * 1024 * 1024,
  quality: 0.82,
};

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Perkecil gambar; bila masih di atas batas, kompresi berulang dengan
 * kualitas/dimensi yang lebih kecil. Mengembalikan File baru (jpeg/webp).
 */
export async function compressImage(file: File, options: CompressOptions = {}): Promise<File> {
  const { maxDimension, maxBytes, quality } = { ...DEFAULTS, ...options };

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, width, height);

  const outputType = "image/webp";
  let currentQuality = quality;
  let blob = await canvasToBlob(canvas, outputType, currentQuality);

  while (blob && blob.size > maxBytes && currentQuality > 0.4) {
    currentQuality = Math.max(0.4, currentQuality - 0.15);
    blob = await canvasToBlob(canvas, outputType, currentQuality);
  }

  if (!blob) return file;

  const name = file.name.replace(/\.[^.]+$/, "") || "gambar";
  return new File([blob], `${name}.webp`, { type: outputType });
}
