import type { AuthError } from "@supabase/supabase-js";

/** Petakan pesan error Supabase Auth ke kode envelope yang konsisten (PRD §14). */
export function mapAuthError(error: unknown): { status: number; code: string; message: string } {
  const authError = error as AuthError | null;
  const message = authError?.message ?? "Terjadi kesalahan tak terduga.";
  const lower = message.toLowerCase();

  if (lower.includes("username sudah dipakai")) {
    return { status: 409, code: "USERNAME_TAKEN", message };
  }
  if (lower.includes("database error saving new user")) {
    // GoTrue menutupi pesan trigger; kemungkinan besar bentrok username/email.
    return {
      status: 409,
      code: "USER_CREATE_FAILED",
      message: "Pendaftaran gagal karena data bentrok. Email atau username mungkin sudah dipakai.",
    };
  }
  if (lower.includes("already registered") || lower.includes("already been registered")) {
    return { status: 409, code: "USER_EXISTS", message: "Email sudah terdaftar. Silakan masuk." };
  }
  if (lower.includes("email not confirmed")) {
    return {
      status: 403,
      code: "EMAIL_NOT_CONFIRMED",
      message: "Email belum diverifikasi. Periksa kotak masuk Anda.",
    };
  }
  if (lower.includes("invalid login credentials")) {
    return { status: 401, code: "INVALID_CREDENTIALS", message: "Email atau password salah." };
  }
  if (lower.includes("provider is not enabled") || lower.includes("unsupported provider")) {
    return {
      status: 503,
      code: "PROVIDER_NOT_CONFIGURED",
      message: "Masuk dengan Google belum dikonfigurasi. Hubungi admin KuisKita.",
    };
  }
  if (lower.includes("session") || lower.includes("jwt")) {
    return { status: 401, code: "SESSION_REQUIRED", message: "Sesi tidak valid. Ulangi prosesnya." };
  }
  return { status: 400, code: "AUTH_ERROR", message };
}

/** Email pengguna yang tampil di pesan error (disamarkan) untuk log/UI. */
export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "***";
  const head = name.slice(0, 2);
  return `${head}${"*".repeat(Math.max(name.length - 2, 1))}@${domain}`;
}
