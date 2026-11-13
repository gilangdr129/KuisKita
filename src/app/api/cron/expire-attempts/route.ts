import { fail, ok } from "@/lib/http/response";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/expire-attempts — dipanggil Vercel Cron: menutup & menilai
 * percobaan yang melewati batas waktu (status expired, skor dari autosave).
 * Dilindungi CRON_SECRET seperti endpoint keep-alive.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || authorization !== `Bearer ${secret}`) {
    return fail(request, 401, "UNAUTHORIZED", "Otorisasi cron tidak valid.");
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.rpc("expire_overdue_attempts");

    if (error) {
      return fail(request, 500, "EXPIRE_FAILED", error.message);
    }

    return ok(request, { task: "expire-overdue-attempts", ditutup: data ?? 0 });
  } catch (error) {
    return fail(
      request,
      500,
      "EXPIRE_FAILED",
      error instanceof Error ? error.message : "Kesalahan tak terduga.",
    );
  }
}
