import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidateKuis } from "@/lib/cache/katalog";
import {
  KUIS_SELECT,
  ambilKonteksKreator,
  keKuisKreator,
  mapKuisError,
  resolveKategori,
} from "@/lib/creator/kuis";
import { fail, ok } from "@/lib/http/response";
import { parseOrFail } from "@/lib/http/validate";
import { quizUpdateSchema, uuidSchema } from "@/lib/validation/schemas";

type Props = { params: Promise<{ id: string }> };

/** Muat kuis milik pengguna; kuis orang lain/tidak ada sama-sama 404. */
async function muatKuisSendiri(supabase: SupabaseClient, userId: string, id: string) {
  return supabase
    .from("quizzes")
    .select("id, status, visibilitas")
    .eq("id", id)
    .eq("owner_id", userId)
    .maybeSingle();
}

/**
 * PATCH /api/creator/quizzes/:id — ubah metadata kuis milik sendiri.
 * Status tidak bisa diubah di sini: terbit lewat F14, tangguh lewat DELETE.
 */
export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const idValid = uuidSchema.safeParse(id);
  if (!idValid.success) {
    return fail(request, 404, "NOT_FOUND", "Kuis tidak ditemukan.");
  }

  const parsed = parseOrFail(request, quizUpdateSchema, await request.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const konteks = await ambilKonteksKreator(request);
  if (!konteks.ok) return konteks.response;

  const { data: kuis } = await muatKuisSendiri(konteks.supabase, konteks.userId, idValid.data);
  if (!kuis) {
    return fail(request, 404, "NOT_FOUND", "Kuis tidak ditemukan atau bukan milik Anda.");
  }

  const perubahan: Record<string, unknown> = {};
  if (parsed.data.judul !== undefined) perubahan.judul = parsed.data.judul;
  if (parsed.data.deskripsi !== undefined) perubahan.deskripsi = parsed.data.deskripsi;
  if (parsed.data.durasi_detik !== undefined) perubahan.durasi_detik = parsed.data.durasi_detik;
  if (parsed.data.kesulitan !== undefined) perubahan.kesulitan = parsed.data.kesulitan;
  if (parsed.data.acak_soal !== undefined) perubahan.acak_soal = parsed.data.acak_soal;
  if (parsed.data.acak_opsi !== undefined) perubahan.acak_opsi = parsed.data.acak_opsi;
  if (parsed.data.visibilitas !== undefined) perubahan.visibilitas = parsed.data.visibilitas;
  if (parsed.data.maks_percobaan !== undefined) {
    perubahan.maks_percobaan = parsed.data.maks_percobaan ?? null;
  }

  // Kategori: key hadir (termasuk null) berarti "ubah"; absen berarti biarkan.
  if (parsed.data.kategori !== undefined) {
    const kategori = await resolveKategori(konteks.supabase, parsed.data.kategori, request);
    if (!kategori.ok) return kategori.response;
    perubahan.category_id = kategori.categoryId;
  }

  if (Object.keys(perubahan).length === 0) {
    return fail(request, 400, "VALIDATION_ERROR", "Tidak ada perubahan yang dikirim.");
  }

  const { data, error } = await konteks.supabase
    .from("quizzes")
    .update(perubahan)
    .eq("id", idValid.data)
    .eq("owner_id", konteks.userId)
    .select(KUIS_SELECT)
    .single();

  if (error || !data) {
    return mapKuisError(request, error, "Gagal menyimpan perubahan kuis.");
  }

  // Kuis terbit+publik muncul di katalog & detail (ISR): segarkan cache-nya.
  if (kuis.status === "published" && kuis.visibilitas === "public") {
    revalidateKuis(idValid.data);
  }

  return ok(request, keKuisKreator(data as unknown as Record<string, unknown>));
}

/**
 * DELETE /api/creator/quizzes/:id — draf: hapus permanen.
 * Status lain (terbit/tangguh): transisi ke tangguh + privat, karena URL kuis
 * yang sudah publik tidak boleh hilang begitu saja. Trigger DB
 * (quizzes_delete_to_suspend) tetap menjadi penjaga ketika draf ternyata
 * sudah punya percobaan.
 */
export async function DELETE(request: Request, { params }: Props) {
  const { id } = await params;
  const idValid = uuidSchema.safeParse(id);
  if (!idValid.success) {
    return fail(request, 404, "NOT_FOUND", "Kuis tidak ditemukan.");
  }

  const konteks = await ambilKonteksKreator(request);
  if (!konteks.ok) return konteks.response;

  const { data: kuis } = await muatKuisSendiri(konteks.supabase, konteks.userId, idValid.data);
  if (!kuis) {
    return fail(request, 404, "NOT_FOUND", "Kuis tidak ditemukan atau bukan milik Anda.");
  }

  if (kuis.status === "draft") {
    const { error } = await konteks.supabase
      .from("quizzes")
      .delete()
      .eq("id", idValid.data)
      .eq("owner_id", konteks.userId);

    if (error) {
      return mapKuisError(request, error, "Gagal menghapus kuis.");
    }

    // Trigger DB bisa mengubah DELETE menjadi suspend (draf ternyata sudah
    // dikerjakan): baris masih ada berarti tindakan sebenarnya adalah tangguh.
    const { data: sisa } = await konteks.supabase
      .from("quizzes")
      .select("id, status")
      .eq("id", idValid.data)
      .maybeSingle();

    if (sisa) {
      revalidateKuis(idValid.data);
      return ok(request, { id: idValid.data, aksi: "ditangguhkan", status: sisa.status });
    }

    return ok(request, { id: idValid.data, aksi: "dihapus", status: "draft" });
  }

  const { data, error } = await konteks.supabase
    .from("quizzes")
    .update({ status: "suspended", visibilitas: "private" })
    .eq("id", idValid.data)
    .eq("owner_id", konteks.userId)
    .select("id, status")
    .single();

  if (error || !data) {
    return mapKuisError(request, error, "Gagal menangguhkan kuis.");
  }

  // Kuis yang tadinya publik harus keluar dari katalog/detail segera.
  if (kuis.status === "published" && kuis.visibilitas === "public") {
    revalidateKuis(idValid.data);
  }

  return ok(request, { id: idValid.data, aksi: "ditangguhkan", status: data.status });
}