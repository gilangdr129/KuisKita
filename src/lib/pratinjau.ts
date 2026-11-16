import type { SoalTampil } from "@/components/kuis/soal-daftar";
import { SOAL_SELECT } from "@/lib/creator/soal";
import { getServiceSupabase } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/schemas";

export type PratinjauKuis = {
  id: string;
  judul: string;
  deskripsi: string | null;
  kesulitan: string;
  durasi_detik: number;
  status: string;
  visibilitas: string;
  kategori_nama: string | null;
  kreator_username: string | null;
};

export type PratinjauData = {
  kuis: PratinjauKuis;
  soal: SoalTampil[];
};

/**
 * Muat data pratinjau draft: token harus valid, belum kedaluwarsa, DAN
 * dimiliki oleh pengguna yang sedang login ("akses sebagai pemilik").
 * Soal dibaca tanpa filter status — draf pun ikut tampil bagi pemiliknya.
 */
export async function ambilPratinjau(token: string, userId: string): Promise<PratinjauData | null> {
  const tokenValid = uuidSchema.safeParse(token);
  if (!tokenValid.success) return null;

  const supabase = getServiceSupabase();

  const { data, error } = await supabase.rpc("pakai_token_pratinjau", {
    p_token: tokenValid.data,
  });
  if (error || !data) return null;

  const info = data as { quiz_id: string; user_id: string };
  if (info.user_id !== userId) return null;

  const { data: quiz } = await supabase
    .from("quizzes")
    .select(
      "id, judul, deskripsi, kesulitan, durasi_detik, status, visibilitas, owner_id, categories ( nama ), profiles ( username )",
    )
    .eq("id", info.quiz_id)
    .maybeSingle();

  if (!quiz || quiz.owner_id !== userId) return null;

  const { data: soal } = await supabase
    .from("questions")
    .select(SOAL_SELECT)
    .eq("quiz_id", info.quiz_id)
    .order("urutan", { ascending: true });

  const kategoriEmbed = (quiz.categories ?? null) as unknown as { nama: string | null } | null;
  const kreatorEmbed = (quiz.profiles ?? null) as unknown as
    | { username: string }
    | { username: string }[]
    | null;
  const kreatorUsername = Array.isArray(kreatorEmbed)
    ? kreatorEmbed[0]?.username ?? null
    : kreatorEmbed?.username ?? null;

  return {
    kuis: {
      id: String(quiz.id),
      judul: String(quiz.judul),
      deskripsi: (quiz.deskripsi as string | null) ?? null,
      kesulitan: String(quiz.kesulitan),
      durasi_detik: Number(quiz.durasi_detik),
      status: String(quiz.status),
      visibilitas: String(quiz.visibilitas),
      kategori_nama: kategoriEmbed?.nama ?? null,
      kreator_username: kreatorUsername,
    },
    soal: (soal ?? []).map((item) => ({
      id: item.id,
      teks: item.teks,
      tipe: item.tipe,
      bobot: Number(item.bobot),
      urutan: item.urutan,
      gambar_url: item.gambar_url ?? null,
      opsi: (item.options ?? [])
        .slice()
        .sort((a, b) => a.urutan - b.urutan)
        .map((o) => ({ id: o.id, teks: o.teks, urutan: o.urutan })),
    })),
  };
}