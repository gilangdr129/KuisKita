import { fail, ok } from "@/lib/http/response";
import { mapRpcError } from "@/lib/attempts/errors";
import { verifikasiSkorDariDb } from "@/lib/attempts/skor";
import { nonaktifkanPeringkat } from "@/lib/leaderboard/redis";
import { SUBMIT_RATE_LIMIT, batasi } from "@/lib/security/ratelimit";
import { attemptIdSchema } from "@/lib/validation/schemas";
import { createUserClient, getServiceSupabase } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ id: string }>;
};

/** Durasi minimum wajar sebelum submit (F18): di bawah ini ditandai review. */
const MIN_DURASI_SUBMIT_MS = 5000;

/**
 * POST /api/attempts/:id/submit — submit dan nilai (idempoten).
 *
 * Bila waktu sudah habis, server tetap menilai jawaban tersimpan (status
 * expired) dan membalas 409 dengan hasil di dalam envelope error.
 * Submit yang terlalu cepat (< 5 detik sejak mulai) tetap diterima tetapi
 * ditandai `tanda_review` dan dicatat — bukan diblokir (F18).
 */
export async function POST(request: Request, { params }: Props) {
  const { id } = await params;
  const validation = attemptIdSchema.safeParse(id);
  if (!validation.success) {
    return fail(request, 400, "VALIDATION_ERROR", "ID percobaan tidak valid.");
  }

  const session = await createUserClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) {
    return fail(request, 401, "UNAUTHORIZED", "Anda harus masuk untuk submit percobaan.");
  }

  // Rate limit: 5 submit per menit per pengguna (F18).
  const batas = await batasi(request, `submit:${user.id}`, SUBMIT_RATE_LIMIT.max);
  if (batas) return batas;

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("submit_attempt", {
    p_attempt_id: validation.data,
    p_user_id: user.id,
  });

  if (error) {
    const mapped = mapRpcError(error);
    return fail(request, mapped.status, mapped.code, mapped.message);
  }

  const hasil = data as {
    expired?: boolean;
    skor?: number | string | null;
    persentase?: number | string | null;
    benar?: number | null;
    salah?: number | null;
    total_soal?: number | null;
    durasi_ms?: number | null;
    status?: string;
    submitted_at?: string;
    sudah_final?: boolean;
  };

  // Jaring pengamar: hasil RPC dicocokkan dengan rumus TypeScript (lihat
  // src/lib/attempts/skor.ts) — ketidaksesuaian dicatat untuk investigasi.
  const selisih = await verifikasiSkorDariDb(supabase, validation.data, hasil);
  if (selisih.length > 0) {
    console.error("SKOR_DRIFT", { attempt: validation.data, selisih });
  }

  // Percobaan kini final → masuk papan peringkat: invalidasi cache kuis ini
  // (naikkan nomor versi; entri cache lama tak akan terbaca lagi).
  const { data: attempt } = await supabase
    .from("attempts")
    .select("quiz_id")
    .eq("id", validation.data)
    .maybeSingle();
  if (attempt?.quiz_id) {
    await nonaktifkanPeringkat(attempt.quiz_id);
  }

  // Deteksi submit terlalu cepat (F18): tandai untuk review, JANGAN blokir —
  // jawaban pemain tetap dinilai normal.
  const terlaluCepat = hasil.durasi_ms != null && hasil.durasi_ms < MIN_DURASI_SUBMIT_MS;
  if (terlaluCepat) {
    console.warn("SUBMIT_TERLALU_CEPAT", {
      attempt_id: validation.data,
      user_id: user.id,
      durasi_ms: hasil.durasi_ms,
    });
  }
  const hasilAkhir = { ...hasil, tanda_review: terlaluCepat };

  if (hasil.expired) {
    return fail(request, 409, "ATTEMPT_EXPIRED", "Waktu pengerjaan sudah habis. Jawaban Anda dinilai dari simpanan terakhir.", {
      extra: { hasil: hasilAkhir },
    });
  }

  return ok(request, hasilAkhir);
}
