#!/usr/bin/env node
/**
 * Seed konten dev F6: satu kuis terbit (8 soal campuran) + satu kuis draf untuk
 * uji privat. Ditulis lewat service role (admin API + SQL sebagai postgres),
 * bukan lewat klien/REST anon.
 *
 *   node scripts/db/seed-quiz.mjs           # buat bila belum ada
 */

import { readFileSync } from "node:fs";
import pg from "pg";
import process from "node:process";

function parseEnvLocal() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  }
  return env;
}

const env = parseEnvLocal();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey || !env.DATABASE_URL) {
  console.error("SKIP: .env.local belum lengkap (butuh URL + service role + DATABASE_URL).");
  process.exit(0);
}

const serviceHeaders = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  "content-type": "application/json",
};

const SEED_EMAIL = "creator.kuiskita@example.com";
const SEED_PASSWORD = "kuiskita-seed-2026"; // hanya untuk dev/staging

const KUIS_TERBIT = {
  judul: "Kuis Pengetahuan Umum Indonesia",
  deskripsi:
    "Delapan soal ringan tentang Indonesia: dari flora fauna sampai adat istiadat. Cocok untuk pemanasan.",
  kesulitan: "easy",
  durasi_detik: 900,
  status: "published",
  visibilitas: "public",
};

const KUIS_DRAF = {
  judul: "Kuis Draf — Uji Privat",
  deskripsi: "Kuis draf untuk memastikan hanya pemilik yang bisa melihatnya.",
  kesulitan: "medium",
  durasi_detik: 600,
  status: "draft",
  visibilitas: "public",
};

const SOAL = [
  {
    teks: "Apa nama gunung tertinggi di Indonesia?",
    tipe: "single",
    bobot: 2,
    pembahasan: "Puncak Jaya Wijaya (Carstensz Pyramid) di Papua, tinggi sekitar 4.884 mdpl.",
    opsi: [
      { teks: "Gunung Kerinci", benar: false },
      { teks: "Puncak Jaya Wijaya", benar: true },
      { teks: "Gunung Rinjani", benar: false },
      { teks: "Gunung Semeru", benar: false },
    ],
  },
  {
    teks: "Ibu kota provinsi Jawa Tengah adalah Semarang.",
    tipe: "boolean",
    bobot: 1,
    pembahasan: "Semarang memang ibu kota Provinsi Jawa Tengah.",
    opsi: [
      { teks: "Benar", benar: true },
      { teks: "Salah", benar: false },
    ],
  },
  {
    teks: "Burung cenderawasih merupakan fauna identitas dari provinsi mana?",
    tipe: "single",
    bobot: 1,
    pembahasan: "Cenderawasih adalah fauna identitas Papua.",
    opsi: [
      { teks: "Bali", benar: false },
      { teks: "Papua", benar: true },
      { teks: "Sumatera Utara", benar: false },
      { teks: "Kalimantan Timur", benar: false },
    ],
  },
  {
    teks: "Berapa jumlah provinsi di Indonesia saat ini?",
    tipe: "single",
    bobot: 2,
    pembahasan: "Seitunggal pemekaran Papua 2022, Indonesia memiliki 38 provinsi.",
    opsi: [
      { teks: "34", benar: false },
      { teks: "37", benar: false },
      { teks: "38", benar: true },
      { teks: "41", benar: false },
    ],
  },
  {
    teks: "Tari Saman berasal dari provinsi Aceh.",
    tipe: "boolean",
    bobot: 1,
    pembahasan: "Tari Saman berasal dari suko Gayo, Aceh.",
    opsi: [
      { teks: "Benar", benar: true },
      { teks: "Salah", benar: false },
    ],
  },
  {
    teks: "Candi Borobudur terletak di provinsi mana?",
    tipe: "single",
    bobot: 1,
    pembahasan: "Candi Borobudur berada di Magelang, Jawa Tengah.",
    opsi: [
      { teks: "DI Yogyakarta", benar: false },
      { teks: "Jawa Tengah", benar: true },
      { teks: "Jawa Timur", benar: false },
      { teks: "Banten", benar: false },
    ],
  },
  {
    teks: "Komodo hanya ditemukan di Kepulauan Nusa Tenggara.",
    tipe: "boolean",
    bobot: 1,
    pembahasan: "Komodo memang habitat aslinya di Pulau Komodo, NTT.",
    opsi: [
      { teks: "Benar", benar: true },
      { teks: "Salah", benar: false },
    ],
  },
  {
    teks: "Lagu Indonesia Raya pertama kali diciptakan oleh Wage Rudolf Supratman.",
    tipe: "boolean",
    bobot: 2,
    pembahasan: "W.R. Supratman menciptakan lagu Indonesia Raya dan pertama diperdengarkan 1928.",
    opsi: [
      { teks: "Benar", benar: true },
      { teks: "Salah", benar: false },
    ],
  },
];

async function pastikanCreator(client) {
  const list = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: serviceHeaders,
  });
  const users = (await list.json()).users ?? [];
  let seed = users.find((u) => u.email === SEED_EMAIL);

  if (!seed) {
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({ email: SEED_EMAIL, password: SEED_PASSWORD, email_confirm: true }),
    });
    seed = await created.json();
    if (!seed.id) throw new Error(`Gagal membuat user seed: ${JSON.stringify(seed)}`);
    console.log(`  user seed dibuat: ${SEED_EMAIL}`);
  } else {
    console.log("  user seed sudah ada");
  }

  const role = await client.query(
    "update public.profiles set role = 'creator' where id = $1 returning role",
    [seed.id],
  );
  console.log(`  peran profil: ${role.rows[0]?.role}`);
  return seed.id;
}

async function buatKuis(client, ownerId, meta) {
  const ada = await client.query("select id from public.quizzes where judul = $1", [meta.judul]);
  if (ada.rows[0]) {
    console.log(`  kuis sudah ada: ${meta.judul}`);
    return ada.rows[0].id;
  }

  const kategori = await client.query(
    "select id from public.categories where slug = 'umum' order by id limit 1",
  );

  const quiz = await client.query(
    `insert into public.quizzes
       (owner_id, judul, deskripsi, category_id, kesulitan, durasi_detik, status, visibilitas, acak_soal, acak_opsi)
     values ($1, $2, $3, $4, $5, $6, $7, $8, false, false)
     returning id`,
    [
      ownerId,
      meta.judul,
      meta.deskripsi,
      kategori.rows[0]?.id ?? null,
      meta.kesulitan,
      meta.durasi_detik,
      meta.status,
      meta.visibilitas,
    ],
  );
  const quizId = quiz.rows[0].id;
  console.log(`  kuis dibuat: ${meta.judul} (${quizId})`);
  return quizId;
}

async function isiSoal(client, quizId, soalList) {
  const sudah = await client.query("select count(*)::int as n from public.questions where quiz_id = $1", [quizId]);
  if (sudah.rows[0].n > 0) {
    console.log(`  soal sudah terisi (${sudah.rows[0].n} soal), lewati`);
    return;
  }

  for (const [index, soal] of soalList.entries()) {
    const q = await client.query(
      `insert into public.questions (quiz_id, teks, tipe, bobot, urutan, pembahasan)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [quizId, soal.teks, soal.tipe, soal.bobot, index, soal.pembahasan],
    );
    const questionId = q.rows[0].id;

    for (const [urutan, opsi] of soal.opsi.entries()) {
      const o = await client.query(
        `insert into public.options (question_id, teks, urutan)
         values ($1, $2, $3) returning id`,
        [questionId, opsi.teks, urutan],
      );
      if (opsi.benar) {
        await client.query(
          `insert into public.question_keys (question_id, option_id) values ($1, $2)`,
          [questionId, o.rows[0].id],
        );
      }
    }
  }
  console.log(`  ${soalList.length} soal + opsi + kunci terisi`);
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query("begin");

  console.log("1/4 Menyiapkan kreator seed…");
  const ownerId = await pastikanCreator(client);

  console.log("2/4 Membuat kuis terbit…");
  const kuisId = await buatKuis(client, ownerId, KUIS_TERBIT);
  await isiSoal(client, kuisId, SOAL);

  console.log("3/4 Membuat kuis draf…");
  const drafId = await buatKuis(client, ownerId, KUIS_DRAF);
  await isiSoal(client, drafId, [
    {
      teks: "Soal draf satu — tidak boleh terlihat publik.",
      tipe: "single",
      bobot: 1,
      pembahasan: "Draf.",
      opsi: [
        { teks: "Opsi A", benar: true },
        { teks: "Opsi B", benar: false },
      ],
    },
  ]);

  const cekKunci = await client.query(
    `select count(*)::int as n from public.question_keys qk
       join public.questions q on q.id = qk.question_id where q.quiz_id = $1`,
    [kuisId],
  );

  await client.query("commit");

  console.log("4/4 Selesai.");
  console.log(`   Kuis terbit : ${kuisId} (${cekKunci.rows[0].n} kunci jawaban tersimpan)`);
  console.log(`   Kuis draf   : ${drafId}`);
  console.log(`   URL lokal   : http://localhost:3000/kuis/${kuisId}`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  console.error("Seed GAGAL:", error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}
