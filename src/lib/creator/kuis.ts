import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";
import { fail } from "@/lib/http/response";
import { createUserClient } from "@/lib/supabase/server";

/** Tampilan kuis untuk kreator (semua status, termasuk draf & tangguh). */
export type KuisKreator = {
  id: string;
  judul: string;
  deskripsi: string | null;
  kesulitan: string;
  durasi_detik: number;
  status: string;
  visibilitas: string;
  acak_soal: boolean;
  acak_opsi: boolean;
  maks_percobaan: number | null;
  kategori: { nama: string | null; slug: string | null };
  jumlah_soal: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

/** Kolom yang dikembalikan endpoint kreator (tanpa kunci jawaban). */
export const KUIS_SELECT =
  "id, judul, deskripsi, kesulitan, durasi_detik, status, visibilitas, " +
  "acak_soal, acak_opsi, maks_percobaan, category_id, created_at, updated_at, " +
  "published_at, categories ( nama, slug ), questions ( count )";

export type KonteksKreator =
  | { ok: true; userId: string; supabase: SupabaseClient }
  | { ok: false; response: NextResponse };

/**
 * Konteks kreator untuk route handler: sesi wajib + peran harus creator/admin.
 * Operasi data memakai klien ter-sesi agar RLS tetap menjadi penjaga terakhir;
 * peran dibaca dari kolom profiles.role (cuma diketahui server).
 */
export async function ambilKonteksKreator(request: Request): Promise<KonteksKreator> {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: fail(request, 401, "UNAUTHORIZED", "Anda harus masuk untuk mengelola kuis."),
    };
  }

  const { data: profil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profil?.role !== "creator" && profil?.role !== "admin") {
    return {
      ok: false,
      response: fail(request, 403, "FORBIDDEN", "Hanya kreator yang dapat mengelola kuis."),
    };
  }

  return { ok: true, userId: user.id, supabase };
}

/** Ubah slug kategori menjadi category_id; 400 bila slug tidak dikenal. */
export async function resolveKategori(
  supabase: SupabaseClient,
  slug: string | null | undefined,
  request: Request,
): Promise<{ ok: true; categoryId: number | null } | { ok: false; response: NextResponse }> {
  if (slug === null || slug === undefined || slug === "") {
    return { ok: true, categoryId: null };
  }

  const { data: kategori } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (!kategori) {
    return {
      ok: false,
      response: fail(request, 400, "VALIDATION_ERROR", `Kategori "${slug}" tidak ditemukan.`),
    };
  }

  return { ok: true, categoryId: kategori.id as number };
}

/**
 * Petakan kesalahan PostgREST/PostgreSQL ke respons API:
 * pelanggaran RLS/izin → 403, constraint → 400/409, sisanya 500 (tidak
 * ditelan seperti katalog publik — kegagalan tulis harus terlihat).
 */
export function mapKuisError(
  request: Request,
  error: { code?: string; message?: string } | null,
  fallbackPesan: string,
): NextResponse {
  const kode = error?.code ?? "";
  const pesan = error?.message ?? "";

  if (kode === "42501" || pesan.includes("row-level security")) {
    return fail(request, 403, "FORBIDDEN", "Anda tidak memiliki akses untuk tindakan ini.");
  }

  if (kode === "23505") {
    return fail(request, 409, "CONFLICT", "Data kuis bertabrakan dengan data lain.");
  }

  if (kode === "23514" || kode === "23502" || kode === "23503") {
    return fail(request, 400, "VALIDATION_ERROR", pesan || fallbackPesan);
  }

  return fail(request, 500, "INTERNAL_ERROR", fallbackPesan);
}

/** Bentuk baris kuis hasil select menjadi KuisKreator (tanpa kunci jawaban). */
export function keKuisKreator(row: Record<string, unknown>): KuisKreator {
  const kategoriEmbed = row.categories as { nama: string | null; slug: string | null } | null;
  const soalEmbed = row.questions as { count: number }[] | null;

  return {
    id: String(row.id),
    judul: String(row.judul),
    deskripsi: (row.deskripsi as string | null) ?? null,
    kesulitan: String(row.kesulitan),
    durasi_detik: Number(row.durasi_detik),
    status: String(row.status),
    visibilitas: String(row.visibilitas),
    acak_soal: Boolean(row.acak_soal),
    acak_opsi: Boolean(row.acak_opsi),
    maks_percobaan: row.maks_percobaan == null ? null : Number(row.maks_percobaan),
    kategori: { nama: kategoriEmbed?.nama ?? null, slug: kategoriEmbed?.slug ?? null },
    jumlah_soal: Number(soalEmbed?.[0]?.count ?? 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    published_at: (row.published_at as string | null) ?? null,
  };
}