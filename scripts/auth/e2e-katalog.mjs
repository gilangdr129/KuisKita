#!/usr/bin/env node
/**
 * E2E katalog — Gate F10:
 *   - filter kombinasi (2+) benar
 *   - halaman > batas → kosong
 *   - draft/suspended → 404 tamu
 *   - paginasi kursor konsisten (tidak ada item terulang/terlewat)
 *   - metadata publik: jumlah soal, kreator, skor tertinggi
 *
 * Jalankan dev server (npm run dev) dan seed (npm run db:seed) lebih dulu:
 *   node scripts/auth/e2e-katalog.mjs
 */

import { readFileSync } from "node:fs";
import pg from "pg";
import process from "node:process";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

function parseEnvLocal() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  }
  return env;
}

const env = parseEnvLocal();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !env.DATABASE_URL) {
  console.error("SKIP: .env.local belum lengkap.");
  process.exit(0);
}

const results = [];
function report(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const serviceHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
};

async function kueri(params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  }
  const res = await fetch(`${BASE_URL}/api/quizzes?${qs.toString()}`);
  const json = await res.json();
  return { status: res.status, data: json?.data ?? { items: [], next_cursor: null, has_more: false } };
}

const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const quizzesToDelete = [];

try {
  await client.connect();

  // ---------------------------------------------- data uji tambahan
  const kuis = await client.query(
    `select id, judul from public.quizzes where judul = 'Kuis Pengetahuan Umum Indonesia' limit 1`,
  );
  const kuisUtama = kuis.rows[0];
  if (!kuisUtama) throw new Error("jalankan 'npm run db:seed' lebih dulu");

  // Kuis populer (percobaan) + kuis kesulitan hard + kategori sains + draf.
  const owner = await client.query(
    `select p.id from public.profiles p where p.role in ('creator','admin') order by p.created_at limit 1`,
  );
  const ownerId = owner.rows[0].id;

  const tambahan = [];
  for (const [i, meta] of [
    { judul: "Kuis Populer Uji", kesulitan: "easy", durasi: 600, kategori: "umum", status: "published", percobaan: 5 },
    { judul: "Kuis Sains Sulit Uji", kesulitan: "hard", durasi: 1200, kategori: "sains", status: "published", percobaan: 1 },
    { judul: "Kuis Draf Katalog Uji", kesulitan: "easy", durasi: 300, kategori: "umum", status: "draft", percobaan: 0 },
    { judul: "Kuis Suspended Katalog Uji", kesulitan: "easy", durasi: 300, kategori: "umum", status: "suspended", percobaan: 0 },
  ].entries()) {
    const q = await client.query(
      `insert into public.quizzes (owner_id, judul, deskripsi, category_id, kesulitan, durasi_detik, status, visibilitas, published_at)
       select $1, $2, 'kuis tambahan untuk uji katalog', (select id from public.categories where slug = $3), $4, $5, $6, 'public',
              case when $6 = 'published' then now() else null end
       returning id`,
      [ownerId, meta.judul, meta.kategori, meta.kesulitan, meta.durasi, meta.status],
    );
    quizzesToDelete.push(q.rows[0].id);
    tambahan.push({ id: q.rows[0].id, ...meta });
    if (meta.percobaan > 0) {
      // Percobaan dibuat lewat SQL mentah; pemiliknya dibuat via admin API
      // (bukan SQL langsung) supaya trigger profil & hash password Supabase
      // tetap berperan.
      const dibuat = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({
          email: `katalog-uji-${meta.percobaan}-${i}@example.com`,
          password: "rahasia-uji-123",
          email_confirm: true,
        }),
      });
      const userUji = await dibuat.json();
      for (let n = 0; n < meta.percobaan; n += 1) {
        await client.query(
          `insert into public.attempts (quiz_id, user_id, started_at, expires_at, submitted_at, skor, persentase, durasi_ms, status)
           values ($1, $2, now() - interval '1 hour', now() - interval '30 minutes', now() - interval '31 minutes', 50, 50, 60000, 'submitted')`,
          [q.rows[0].id, userUji.id],
        );
      }
    }
  }

  // halaman detail: publik vs non-publik
  const halamanUtama = await fetch(`${BASE_URL}/kuis/${kuisUtama.id}`);
  report("detail kuis terbit tampil (200)", halamanUtama.status === 200, `status ${halamanUtama.status}`);

  const halamanUtamaHtml = await halamanUtama.text();
  report(
    "detail menampilkan metadata (soal, kreator) + kartu mulai",
    halamanUtamaHtml.includes("8<!-- --> soal") &&
      halamanUtamaHtml.includes("dibuat oleh @<!-- -->creator.kuiskita") &&
      halamanUtamaHtml.includes("Siap mengerjakan?"),
    "metadata + kontrol mulai",
  );

  const kunciBocor = !halamanUtamaHtml.includes("question_keys");
  report("detail tidak memuat kunci jawaban", kunciBocor, kunciBocor ? "bersih" : "BOCOR");

  for (const meta of tambahan.filter((t) => t.status !== "published")) {
    const res = await fetch(`${BASE_URL}/kuis/${meta.id}`);
    report(`${meta.status} → 404 tamu`, res.status === 404, `status ${res.status}`);
  }

  const hilang = await fetch(`${BASE_URL}/kuis/00000000-0000-0000-0000-000000000000`);
  report("kuis tidak ada → 404", hilang.status === 404, `status ${hilang.status}`);

  // ---------------------------------------------------------- katalog
  const semua = await kueri({ limit: 50 });
  const judulSemua = (semua.data.items ?? []).map((i) => i.judul);
  report(
    "hanya kuis published+public yang muncul",
    judulSemua.includes(kuisUtama.judul) &&
      judulSemua.includes("Kuis Populer Uji") &&
      !judulSemua.includes("Kuis Draf Katalog Uji") &&
      !judulSemua.includes("Kuis Suspended Katalog Uji"),
    `${judulSemua.length} kuis: ${judulSemua.join(", ")}`,
  );

  const item = (semua.data.items ?? []).find((i) => i.judul === kuisUtama.judul);
  // Skor tertinggi dicek terhadap DB: kuis tanpa percobaan bersubmit => null.
  const skorDb = await client.query(
    `select max(persentase) as skor from public.attempts where quiz_id = $1 and submitted_at is not null`,
    [kuisUtama.id],
  );
  const skorDbNilai = skorDb.rows[0]?.skor == null ? null : Number(skorDb.rows[0].skor);
  report(
    "metadata publik lengkap (jumlah soal, kreator, skor tertinggi sesuai DB)",
    Boolean(item) &&
      item.jumlah_soal === 8 &&
      item.kreator_username === "creator.kuiskita" &&
      (item.skor_tertinggi ?? null) === skorDbNilai,
    `soal ${item?.jumlah_soal}, kreator ${item?.kreator_username}, skor ${item?.skor_tertinggi} (DB: ${skorDbNilai})`,
  );

  // filter kombinasi: kesulitan + kategori
  const kombinasi = await kueri({ kesulitan: "hard", kategori: "sains" });
  const judulKombinasi = (kombinasi.data.items ?? []).map((i) => i.judul);
  report(
    "filter kombinasi kesulitan+kategori benar",
    judulKombinasi.includes("Kuis Sains Sulit Uji") && !judulKombinasi.includes(kuisUtama.judul),
    judulKombinasi.join(", "),
  );

  // filter durasi
  const durasiPanjang = await kueri({ durasi: "panjang" });
  const semuaPanjang = durasiPanjang.status === 200 && (durasiPanjang.data.items ?? []).every((i) => i.durasi_detik > 900);
  report("filter durasi 'panjang' (>15 menit) benar", semuaPanjang, `${(durasiPanjang.data.items ?? []).length} item`);

  // sortir terpopuler
  const populer = await kueri({ sortir: "terpopuler", limit: 10 });
  const urutPopuler = (populer.data.items ?? []).map((i) => i.jumlah_percobaan);
  const urutBenar = urutPopuler.every((v, idx) => idx === 0 || urutPopuler[idx - 1] >= v);
  const populerPertama = populer.data.items?.[0]?.judul;
  report(
    "sortir terpopuler: kuis dengan 5 percobaan di atas",
    urutBenar && populerPertama === "Kuis Populer Uji",
    `teratas: ${populerPertama} (${urutPopuler[0]} percobaan)`,
  );

  // pencarian
  const cari = await kueri({ q: "Cenderawasih" });
  const cariJudul = (cari.data.items ?? []).map((i) => i.judul);
  report(
    "pencarian menemukan kuis via isi pertanyaan? (judul/deskripsi saja)",
    cari.status === 200,
    `${cariJudul.length} hasil untuk 'Cenderawasih'`,
  );
  const cariJudulQ = await kueri({ q: "Populer" });
  report(
    "pencarian judul bekerja",
    (cariJudulQ.data.items ?? []).some((i) => i.judul === "Kuis Populer Uji"),
    `${(cariJudulQ.data.items ?? []).length} hasil`,
  );

  // halaman > batas → kosong (kursor = string JSON di masa lalu)
  const jauh = await kueri({
    limit: 20,
    cursor: JSON.stringify({ t: "2000-01-01T00:00:00Z", i: "00000000-0000-0000-0000-000000000000" }),
  });
  report(
    "halaman > batas → kosong (has_more false)",
    jauh.status === 200 && (jauh.data.items ?? []).length === 0 && jauh.data.has_more === false,
    `${(jauh.data.items ?? []).length} item, has_more ${jauh.data.has_more}`,
  );

  // paginasi kursor: halaman berikutnya tanpa tumpang tindih, total utuh
  const halaman1 = await kueri({ limit: 2, sortir: "terbaru" });
  const cursor2 = halaman1.data.next_cursor;
  const halaman2 = await kueri({ limit: 2, sortir: "terbaru", cursor: cursor2 });
  const id1 = (halaman1.data.items ?? []).map((i) => i.id);
  const id2 = (halaman2.data.items ?? []).map((i) => i.id);
  const semuaId = (semua.data.items ?? []).map((i) => i.id);
  report(
    "kursor: halaman 2 tanpa tumpang tindih + keseluruhan utuh",
    id1.length === 2 &&
      id2.length >= 1 &&
      id1.every((id) => !id2.includes(id)) &&
      [...id1, ...id2].every((id) => semuaId.includes(id)),
    `${id1.length} + ${id2.length} item, kursor: ${cursor2?.slice(0, 32)}`,
  );

  // validasi input
  const jelek = await kueri({ q: "a".repeat(200) });
  report("pencarian terlalu panjang → 400 VALIDATION_ERROR", jelek.status === 400, `status ${jelek.status}`);
  const limitJelek = await kueri({ limit: 999 });
  report("limit > 50 → 400 VALIDATION_ERROR", limitJelek.status === 400, `status ${limitJelek.status}`);
  const sortirJelek = await kueri({ sortir: "sesuatu" });
  report("sortir tidak dikenal → 400 VALIDATION_ERROR", sortirJelek.status === 400, `status ${sortirJelek.status}`);
} catch (error) {
  report("eksekusi e2e katalog", false, error instanceof Error ? error.message : String(error));
} finally {
  // Hapus kuis uji + user katalog-uji.
  for (const id of quizzesToDelete) {
    if (!id) continue;
    await client.query("delete from public.quizzes where id = $1", [id]).catch(() => undefined);
  }
  const users = await client
    .query(`select id, email from auth.users where email like 'katalog-uji-%@example.com'`)
    .catch(() => ({ rows: [] }));
  for (const row of users.rows) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${row.id}`, {
      method: "DELETE",
      headers: serviceHeaders,
    }).catch(() => undefined);
  }
  await client.end().catch(() => undefined);
  console.log(`Bersih-bersih selesai (${quizzesToDelete.length} kuis uji).`);
}

const gagal = results.filter((r) => !r.ok);
console.log(`\nRingkasan: ${results.length - gagal.length}/${results.length} pemeriksaan lolos.`);
if (gagal.length > 0) {
  console.error("GAGAL:", gagal.map((g) => g.name).join(", "));
  process.exit(1);
}
console.log("E2E katalog LULUS.");