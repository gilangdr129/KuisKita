import { fail, ok } from "@/lib/http/response";
import { mapRpcError } from "@/lib/attempts/errors";
import { verifikasiSkorDariDb } from "@/lib/attempts/skor";
import { attemptIdSchema } from "@/lib/validation/schemas";
import { createUserClient, getServiceSupabase } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/attempts/:id/submit — submit dan nilai (idempoten).
 *
 * Bila waktu sudah habis, server tetap menilai jawaban tersimpan (status
 * expired) dan membalas 409 dengan hasil di dalam envelope error.
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

  if (hasil.expired) {
    return fail(request, 409, "ATTEMPT_EXPIRED", "Waktu pengerjaan sudah habis. Jawaban Anda dinilai dari simpanan terakhir.", {
      extra: { hasil },
    });
  }

  return ok(request, hasil);
}
