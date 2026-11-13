import { fail, ok } from "@/lib/http/response";
import { createUserClient, getServiceSupabase } from "@/lib/supabase/server";
import {
  buildStoragePath,
  TUJUAN_UNGGAN,
  validateImageUpload,
  type TujuanUnggahan,
} from "@/lib/uploads/validate";


const BUCKET = "media-kuis";

/** POST /api/uploads — unggah gambar (avatar/soal) dengan validasi server-side. */
export async function POST(request: Request) {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail(request, 401, "UNAUTHORIZED", "Anda harus masuk untuk mengunggah gambar.");
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return fail(request, 400, "INVALID_BODY", "Kirim data sebagai multipart/form-data.");
  }

  const tujuanMentah = form.get("tujuan");
  if (tujuanMentah !== null && !TUJUAN_UNGGAN.includes(tujuanMentah as TujuanUnggahan)) {
    return fail(request, 400, "VALIDATION_ERROR", "tujuan: harus 'avatar' atau 'soal'.");
  }
  const tujuan = (tujuanMentah ?? "avatar") as TujuanUnggahan;

  const file = form.get("file");
  if (!(file instanceof File)) {
    return fail(request, 400, "FILE_REQUIRED", "Berkas tidak ditemukan (field 'file').");
  }

  if (file.size > 2 * 1024 * 1024) {
    return fail(request, 400, "FILE_TOO_LARGE", "Ukuran gambar maksimal 2 MB.");
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const validation = validateImageUpload({ size: file.size, buffer });
  if (!validation.ok) {
    return fail(request, 400, validation.code, validation.message);
  }

  const path = buildStoragePath(tujuan, user.id, validation.fileName);
  const service = getServiceSupabase();

  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: validation.type, upsert: false });

  if (uploadError) {
    return fail(request, 500, "UPLOAD_FAILED", "Gagal menyimpan gambar. Coba lagi.");
  }

  const {
    data: { publicUrl },
  } = service.storage.from(BUCKET).getPublicUrl(path);

  if (tujuan === "avatar") {
    // Hapus avatar lama (folder milik sendiri) bila ada, lalu simpan URL baru
    // lewat klien ter-sesi sehingga RLS profiles tetap berlaku.
    const { data: profilLama } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", user.id);

    if (updateError) {
      await service.storage.from(BUCKET).remove([path]);
      return fail(request, 500, "PROFILE_UPDATE_FAILED", "Gagal menyimpan avatar ke profil.");
    }

    const publicPathPrefix = `/storage/v1/object/public/${BUCKET}/`;
    const oldUrl = profilLama?.avatar_url;
    if (oldUrl?.includes(publicPathPrefix)) {
      const oldPath = oldUrl.slice(oldUrl.indexOf(publicPathPrefix) + publicPathPrefix.length);
      if (oldPath.startsWith(`${tujuan}/${user.id}/`) && oldPath !== path) {
        await service.storage.from(BUCKET).remove([oldPath]);
      }
    }
  }

  return ok(request, { url: publicUrl, path }, { status: 201 });
}
