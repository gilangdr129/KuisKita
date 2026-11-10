import {
  forgotPasswordSchema,
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
