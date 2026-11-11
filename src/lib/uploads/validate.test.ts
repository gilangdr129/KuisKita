import {
  buildStoragePath,
  detectImageType,
  extensionFor,
  MAX_UPLOAD_BYTES,
  randomFileName,
  validateImageUpload,
} from "@/lib/uploads/validate";
import { describe, expect, it } from "vitest";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);

describe("deteksi tipe gambar (MIME sniff)", () => {
  it("mengenali JPEG, PNG, dan WebP", () => {
    expect(detectImageType(JPEG)).toBe("image/jpeg");
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(WEBP)).toBe("image/webp");
  });

  it("menolak GIF, SVG, dan berkas kosong", () => {
    expect(detectImageType(GIF)).toBeNull();
    expect(detectImageType(new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe("validasi unggahan", () => {
  it("menerima PNG valid dan memberi nama acak", () => {
    const result = validateImageUpload({ size: 1024, buffer: PNG });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.type).toBe("image/png");
      expect(result.fileName).toMatch(/^[0-9a-f-]{36}\.png$/);
    }
  });

  it("menolak gambar > 2 MB", () => {
    const result = validateImageUpload({ size: MAX_UPLOAD_BYTES + 1, buffer: PNG });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FILE_TOO_LARGE");
      expect(result.message).toContain("2 MB");
    }
  });

  it("menolak tipe di luar whitelist", () => {
    const result = validateImageUpload({ size: 1024, buffer: GIF });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FILE_TYPE_NOT_ALLOWED");
  });

  it("menolak berkas kosong", () => {
    const result = validateImageUpload({ size: 0, buffer: PNG });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FILE_EMPTY");
  });

  it("nama acak selalu unik", () => {
    const names = new Set([randomFileName("image/jpeg"), randomFileName("image/jpeg")]);
    expect(names.size).toBe(2);
  });
});

describe("path penyimpanan", () => {
  it("mengikuti pola <tujuan>/<uid>/<nama> agar cocok policy Storage", () => {
    expect(buildStoragePath("avatar", "uid-123", "a.png")).toBe("avatar/uid-123/a.png");
    expect(extensionFor("image/webp")).toBe("webp");
  });
});
