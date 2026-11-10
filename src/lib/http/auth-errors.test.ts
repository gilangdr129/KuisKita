import { mapAuthError, maskEmail } from "@/lib/http/auth-errors";
import { AUTH_RATE_LIMIT, checkRateLimit } from "@/lib/security/ratelimit";
import { describe, expect, it } from "vitest";

describe("mapAuthError", () => {
  it("memetakan kegagalan trigger username", () => {
    const mapped = mapAuthError(new Error("username sudah dipakai"));
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe("USERNAME_TAKEN");
  });

  it("memetakan email sudah terdaftar", () => {
    const mapped = mapAuthError({ message: "User already registered" });
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe("USER_EXISTS");
  });

  it("memetakan error database generik GoTrue ke 409 bentrok data", () => {
    const mapped = mapAuthError({ message: "Database error saving new user" });
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe("USER_CREATE_FAILED");
  });

  it("memetakan email belum terverifikasi", () => {
    const mapped = mapAuthError({ message: "Email not confirmed" });
    expect(mapped.status).toBe(403);
    expect(mapped.code).toBe("EMAIL_NOT_CONFIRMED");
  });

  it("memetakan kredensial salah", () => {
    const mapped = mapAuthError({ message: "Invalid login credentials" });
    expect(mapped.status).toBe(401);
    expect(mapped.code).toBe("INVALID_CREDENTIALS");
  });

  it("memetakan error tak dikenal ke 400 generik", () => {
    const mapped = mapAuthError({ message: "sesuatu yang aneh" });
    expect(mapped.status).toBe(400);
    expect(mapped.code).toBe("AUTH_ERROR");
  });
});

describe("maskEmail", () => {
  it("menyamarkan bagian depan email", () => {
    expect(maskEmail("rani@contoh.co.id")).toBe("ra**@contoh.co.id");
  });
});

describe("checkRateLimit (stub F18)", () => {
  it("selalu lolos dan batas awal sesuai PRD §16", async () => {
    const result = await checkRateLimit("masuk:1.2.3.4", AUTH_RATE_LIMIT.max);
    expect(result.success).toBe(true);
    expect(AUTH_RATE_LIMIT.max).toBe(5);
    expect(AUTH_RATE_LIMIT.windowSeconds).toBe(60);
  });
});
