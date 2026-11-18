import { getServerEnv } from "@/lib/env";

export type HasilNotifikasi = {
  terkirim: boolean;
  id?: string;
  alasan?: string;
};

function escapeHtml(teks: string) {
  return teks
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Email notifikasi suspend kuis ke kreator (F17), best-effort via Resend.
 *
 * RESEND_API_KEY tidak wajib: tanpa key, notifikasi hanya dicatat di log
 * (moderasi tetap berjalan). Kegagalan pengiriman tidak pernah menggagalkan
 * aksi admin — hasilnya dilaporkan agar bisa diverifikasi lewat log/response.
 */
export async function kirimEmailSuspend(input: {
  tujuan: string | null;
  judulKuis: string;
  alasan: string | null;
  urlKuis: string;
}): Promise<HasilNotifikasi> {
  const env = getServerEnv();

  if (!input.tujuan) {
    console.log("NOTIFIKASI_SUSPEND", { alasan: "email pemilik tidak tersedia", judul: input.judulKuis });
    return { terkirim: false, alasan: "email pemilik tidak tersedia" };
  }

  if (!env.RESEND_API_KEY) {
    console.log("NOTIFIKASI_SUSPEND", {
      alasan: "RESEND_API_KEY belum diisi (notifikasi dilewati)",
      tujuan: input.tujuan,
      judul: input.judulKuis,
      url: input.urlKuis,
    });
    return { terkirim: false, alasan: "RESEND_API_KEY belum diisi; notifikasi dicatat di log" };
  }

  const pengirim = env.EMAIL_FROM ?? "KuisKita <onboarding@resend.dev>";

  try {
    const respons = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: pengirim,
        to: [input.tujuan],
        subject: `Kuis Anda ditangguhkan: ${input.judulKuis}`,
        html: [
          `<p>Halo,</p>`,
          `<p>Kuis Anda <strong>${escapeHtml(input.judulKuis)}</strong> baru saja ditangguhkan oleh tim moderasi KuisKita dan tidak lagi tampil di katalog publik.</p>`,
          input.alasan ? `<p>Alasan: ${escapeHtml(input.alasan)}</p>` : "",
          `<p>Anda masih dapat membuka dan memperbaikinya melalui dasbor kreator: <a href="${input.urlKuis}">${input.urlKuis}</a></p>`,
          `<p>Terima kasih,<br>Tim KuisKita</p>`,
        ].join(""),
      }),
    });

    const data = (await respons.json().catch(() => ({}))) as { id?: string; message?: string };

    if (!respons.ok) {
      console.error("NOTIFIKASI_SUSPEND_GAGAL", { status: respons.status, tujuan: input.tujuan, data });
      return { terkirim: false, alasan: `Resend menolak (${respons.status}): ${data.message ?? "tanpa pesan"}` };
    }

    console.log("NOTIFIKASI_SUSPEND", { terkirim: true, id: data.id, tujuan: input.tujuan, judul: input.judulKuis });
    return { terkirim: true, id: data.id };
  } catch (error) {
    console.error("NOTIFIKASI_SUSPEND_GAGAL", error);
    return {
      terkirim: false,
      alasan: error instanceof Error ? error.message : "kesalahan jaringan Resend",
    };
  }
}