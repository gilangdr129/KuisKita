import { ambilAdmin } from "@/lib/admin/akses";
import { revalidateKatalog, revalidateKuis } from "@/lib/cache/katalog";
import { gagalRpcSoal } from "@/lib/creator/soal";
import { fail, ok } from "@/lib/http/response";
import { parseOrFail } from "@/lib/http/validate";
import { kirimEmailSuspend } from "@/lib/notifikasi/resend";
import { getServiceSupabase } from "@/lib/supabase/server";
import { adminSuspendSchema, uuidSchema } from "@/lib/validation/schemas";

type Props = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/quizzes/:id/suspend — moderasi kuis oleh admin.
 *
 * Status + visibilitas + audit_logs ditulis atomik oleh RPC; setelahnya cache
 * katalog & detail diperbarui on-demand (hilang < 60 detik), dan kreator
 * diberi tahu lewat email (Resend, best-effort — kegagalan email tidak
 * menggagalkan moderasi). Suspend kedua idempoten: tanpa audit/email baru.
 */
export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const idValid = uuidSchema.safeParse(id);
  if (!idValid.success) {
    return fail(request, 404, "NOT_FOUND", "Kuis tidak ditemukan.");
  }

  const admin = await ambilAdmin(request);
  if (!admin.ok) return admin.response;

  const parsed = parseOrFail(request, adminSuspendSchema, await request.json().catch(() => ({})));
  if (!parsed.ok) return parsed.response;

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("tangguhkan_kuis_admin", {
    p_admin_id: admin.userId,
    p_quiz_id: idValid.data,
    p_alasan: parsed.data.alasan ?? null,
  });

  if (error) {
    return gagalRpcSoal(request, error, "Gagal menangguhkan kuis.");
  }

  const hasil = data as {
    status: string;
    sudah_tangguh: boolean;
    judul?: string;
    owner_email?: string | null;
    alasan?: string | null;
  };

  if (!hasil.sudah_tangguh) {
    // Hilang dari katalog & detail tamu segera (bukan menunggu revalidate berkala).
    revalidateKatalog();
    revalidateKuis(idValid.data);
  }

  const notifikasi = hasil.sudah_tangguh
    ? { terkirim: false, alasan: "tidak ada perubahan; email tidak dikirim" }
    : await kirimEmailSuspend({
        tujuan: hasil.owner_email ?? null,
        judulKuis: hasil.judul ?? idValid.data,
        alasan: hasil.alasan ?? null,
        urlKuis: `${new URL(request.url).origin}/dasbor/kuis/${idValid.data}/edit`,
      });

  return ok(request, { status: hasil.status, sudah_tangguh: hasil.sudah_tangguh, notifikasi });
}