import { fail } from "@/lib/http/response";
import type { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { z } from "zod";

/**
 * Validasi input route handler. Bila gagal, fungsi mengembalikan
 * NextResponse 400 siap kirim (envelope error dengan kode VALIDATION_ERROR);
 * bila berhasil, mengembalikan data yang sudah tervalidasi.
 */
export function parseOrFail<S extends ZodType>(
  request: Request,
  schema: S,
  input: unknown,
): { ok: true; data: z.infer<S> } | { ok: false; response: NextResponse } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
      .join("; ");
    return {
      ok: false,
      response: fail(request, 400, "VALIDATION_ERROR", message),
    };
  }
  return { ok: true, data: parsed.data };
}
