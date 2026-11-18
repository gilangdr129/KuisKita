import { fail, ok } from "@/lib/http/response";
import { parseOrFail } from "@/lib/http/validate";
import { createUserClient } from "@/lib/supabase/server";
import { riwayatQuerySchema } from "@/lib/validation/schemas";

/** Satu baris riwayat percobaan milik pengguna yang login. */
export type RiwayatItem = {
  id: string;
  quiz_id: string;
  quiz_judul: string | null;
  status: string;
  skor: number | null;
  persentase: number | null;
  durasi_ms: number | null;
  started_at: string;
  submitted_at: string | null;
  expires_at: string;
};

/**
 * GET /api/me/attempts — riwayat percobaan milik sendiri.
 *
 * Akses data memakai klien ter-sesi: policy `attempts_self_read` (RLS)
 * memastikan hanya baris milik pengguna ini yang pernah terbaca — bukan
 * sekadar filter di kode. Query dapat difilter `?status=in_progress|
 * submitted|expired`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = parseOrFail(request, riwayatQuerySchema, {
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.ok) return parsed.response;

  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail(request, 401, "UNAUTHORIZED", "Anda harus masuk untuk melihat riwayat percobaan.");
  }

  let query = supabase
    .from("attempts")
    .select(
      "id, quiz_id, status, skor, persentase, durasi_ms, started_at, submitted_at, expires_at, quizzes ( id, judul )",
    )
    .order("started_at", { ascending: false })
    .limit(parsed.data.limit);

  if (parsed.data.status) {
    query = query.eq("status", parsed.data.status);
  }

  const { data, error } = await query;

  if (error) {
    return fail(request, 500, "INTERNAL_ERROR", "Gagal memuat riwayat percobaan.");
  }

  const items: RiwayatItem[] = (data ?? []).map((row) => {
    const embed = (row.quizzes ?? null) as unknown as { id: string; judul: string } | null;
    return {
      id: String(row.id),
      quiz_id: String(row.quiz_id),
      quiz_judul: embed?.judul ?? null,
      status: String(row.status),
      skor: row.skor == null ? null : Number(row.skor),
      persentase: row.persentase == null ? null : Number(row.persentase),
      durasi_ms: row.durasi_ms == null ? null : Number(row.durasi_ms),
      started_at: String(row.started_at),
      submitted_at: row.submitted_at == null ? null : String(row.submitted_at),
      expires_at: String(row.expires_at),
    };
  });

  return ok(request, { items, total: items.length });
}