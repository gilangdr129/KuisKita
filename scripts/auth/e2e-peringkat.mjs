#!/usr/bin/env node
/**
 * E2E papan peringkat — Gate F15:
 *   - tie skor diurutkan waktu tercepat (durasi_ms asc, id sebagai pemecah)
 *   - ?simulate-redis-down → hasil tetap keluar dari DB (sumber "database")
 *   - cache di-invalidate setelah submit baru (attempt baru langsung muncul)
 *   - hanya pengguna login yang berperingkat (setiap entri punya username)
 *   - paginasi kursor + blok "posisi Anda" untuk pemain yang login
 *
 * Jalankan dev server (npm run dev) dan seed (npm run db:seed) lebih dulu:
 *   node scripts/auth/e2e-peringkat.mjs
 */

import { readFileSync } from "node:fs";
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
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SKIP: .env.local belum lengkap.");
  process.exit(0);
}

const SEED_EMAIL = "creator.kuiskita@example.com";
const SEED_PASSWORD = "kuiskita-seed-2026";

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

async function login(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/masuk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) return null;
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

function api(method, path, cookie, body) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));
}

async function buatPengguna(email) {
  const dibuat = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({ email, password: "kuiskita-uji-2026", email_confirm: true }),
  });
  const user = await dibuat.json();
  const id = user?.id;
  if (!id) throw new Error(`gagal membuat pengguna ${email}`);
  // Username unik untuk tiap pemain (dipakai cek D1 di peringkat).
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}`, {
    method: "PATCH",
    headers: serviceHeaders,
    body: JSON.stringify({ username: `uji${String(id).replace(/\D/g, "").slice(0, 12)}` }),
  });
  return id;
}

async function hapusPengguna(id) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: serviceHeaders });
}

/** Sisipkan attempt final langsung (service role) dengan skor & durasi pasti. */
async function sisipkanAttempt(quizId, userId, skor, durasiMs) {
  const sekarang = new Date().toISOString();
  const mulai = new Date(Date.now() - durasiMs - 60_000);
  const selesai = new Date(mulai.getTime() + durasiMs);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/attempts`, {
    method: "POST",
    headers: { ...serviceHeaders, prefer: "return=representation" },
    body: JSON.stringify({
      quiz_id: quizId,
      user_id: userId,
      started_at: mulai.toISOString(),
      expires_at: selesai.toISOString(),
      submitted_at: sekarang,
      status: "submitted",
      skor,
      persentase: skor,
      durasi_ms: durasiMs,
    }),
  });
  const rows = await res.json();
  return rows?.[0]?.id ?? null;
}

const penggunaUji = [];
let quizId = null;

try {
  const stempel = Date.now();
  const cookieSeed = await login(SEED_EMAIL, SEED_PASSWORD);
  report("kreator seed bisa masuk", Boolean(cookieSeed));

  // ---------------------------------------------- kuis khusus (draf → terbit)
  const kuis = await api("POST", "/api/creator/quizzes", cookieSeed, {
    judul: `Kuis Peringkat Uji ${stempel}`,
    durasi_detik: 600,
    kesulitan: "easy",
  });
  quizId = kuis.json?.data?.id ?? null;
  report("kuis uji dibuat", kuis.status === 201 && Boolean(quizId));

  await api("PUT", `/api/creator/quizzes/${quizId}/questions`, cookieSeed, {
    soal: [
      { teks: "Soal satu", tipe: "single", opsi: [{ teks: "A" }, { teks: "B" }] },
      { teks: "Soal dua", tipe: "boolean", opsi: [{ teks: "Benar" }, { teks: "Salah" }] },
    ],
  });
  const soalMuatan = await api("GET", `/api/creator/quizzes/${quizId}/questions`, cookieSeed);
  const daftarSoal = soalMuatan.json?.data?.soal ?? [];
  for (const soal of daftarSoal) {
    await api("PUT", `/api/creator/quizzes/${quizId}/kunci`, cookieSeed, {
      question_id: soal.id,
      option_id: soal.opsi[0].id,
    });
  }
  const terbit = await api("POST", `/api/creator/quizzes/${quizId}/publish`, cookieSeed);
  report("kuis uji terbit", terbit.status === 200, `status ${terbit.status}`);

  // ---------------------------------------------- pemain + attempt sintetis
  const pemain = [];
  for (let i = 1; i <= 4; i += 1) {
    const id = await buatPengguna(`peringkat-uji-${stempel}-${i}@example.com`);
    penggunaUji.push(id);
    pemain.push(id);
  }
  report("4 pemain uji dibuat", pemain.length === 4);

  // p1 skor 50 (terakhir); p2/p3/p4 skor 100 tapi durasi berbeda; p3 & p4
  // durasi sama → tie penuh, dipecah oleh attempt_id (urutan stabil).
  await sisipkanAttempt(quizId, pemain[0], 50, 30_000);
  await sisipkanAttempt(quizId, pemain[1], 100, 60_000);
  await sisipkanAttempt(quizId, pemain[2], 100, 30_000);
  await sisipkanAttempt(quizId, pemain[3], 100, 30_000);

  // ---------------------------------------------- isi & urutan peringkat
  const peringkat = await api("GET", `/api/quizzes/${quizId}/leaderboard?limit=10`, null);
  const items = peringkat.json?.data?.items ?? [];
  report(
    "leaderboard anon → 200 dengan 4 entri",
    peringkat.status === 200 && items.length === 4,
    `status ${peringkat.status}, ${items.length} entri`,
  );

  const urutanBenar =
    items[0]?.skor === 100 && items[0]?.durasi_ms === 30_000 &&
    items[1]?.skor === 100 && items[1]?.durasi_ms === 30_000 &&
    items[2]?.skor === 100 && items[2]?.durasi_ms === 60_000 &&
    items[3]?.skor === 50;
  report(
    "tie skor diurutkan waktu tercepat (30s, 30s, 60s, lalu skor 50)",
    urutanBenar,
    items.map((i) => `${i.skor}/${Math.round(i.durasi_ms / 1000)}s`).join(", "),
  );

  const peringkatBenar = items.every((entri, index) => entri.peringkat === index + 1);
  report("nomor peringkat 1..N berurutan", peringkatBenar, items.map((i) => i.peringkat).join(","));

  const usernameLengkap = items.every((entri) => typeof entri.username === "string" && entri.username.length > 0);
  report(
    "hanya pengguna login yang berperingkat (setiap entri punya username)",
    usernameLengkap,
    items.map((i) => i.username).join(", "),
  );

  const tanpaUserId = items.every((entri) => !("user_id" in entri));
  report("payload entri tidak membocorkan user_id", tanpaUserId, tanpaUserId ? "bersih" : "ada user_id");

  // ---------------------------------------------- posisi pemain & anon
  const cookieP1 = await login(`peringkat-uji-${stempel}-1@example.com`, "kuiskita-uji-2026");
  const milikP1 = await api("GET", `/api/quizzes/${quizId}/leaderboard?limit=10`, cookieP1);
  const sayaP1 = milikP1.json?.data?.saya ?? null;
  report(
    "blok 'posisi Anda' muncul untuk pemain login (peringkat 4, skor 50)",
    sayaP1?.peringkat === 4 && sayaP1?.skor === 50,
    JSON.stringify({ peringkat: sayaP1?.peringkat, skor: sayaP1?.skor }),
  );

  report(
    "anon tidak mendapat blok 'posisi Anda'",
    peringkat.json?.data?.saya === null,
    `saya ${peringkat.json?.data?.saya}`,
  );

  // ---------------------------------------------- paginasi kursor
  const halaman1 = await api("GET", `/api/quizzes/${quizId}/leaderboard?limit=2`, null);
  const halaman2 = await api(
    "GET",
    `/api/quizzes/${quizId}/leaderboard?limit=2&cursor=${encodeURIComponent(halaman1.json?.data?.next_cursor ?? "")}`,
    null,
  );
  const id1 = (halaman1.json?.data?.items ?? []).map((i) => i.attempt_id);
  const id2 = (halaman2.json?.data?.items ?? []).map((i) => i.attempt_id);
  report(
    "kursor: halaman 1 → 2 entri + next_cursor, halaman 2 tanpa tumpang tindih",
    (halaman1.json?.data?.items ?? []).length === 2 &&
      Boolean(halaman1.json?.data?.next_cursor) &&
      id2.length === 2 &&
      id1.every((id) => !id2.includes(id)),
    `h1 ${id1.length}, h2 ${id2.length}`,
  );
  report(
    "halaman 2 melanjutkan peringkat 3–4",
    (halaman2.json?.data?.items ?? [])[0]?.peringkat === 3 &&
      (halaman2.json?.data?.items ?? [])[1]?.peringkat === 4 &&
      halaman2.json?.data?.next_cursor === null,
    `kursor akhir ${halaman2.json?.data?.next_cursor}`,
  );

  // ---------------------------------------------- simulasi Redis tumbang
  const redisMati = await api(
    "GET",
    `/api/quizzes/${quizId}/leaderboard?limit=10&simulate-redis-down=1`,
    null,
  );
  const itemsMati = redisMati.json?.data?.items ?? [];
  report(
    "?simulate-redis-down → 200, sumber database, hasil sama seperti normal",
    redisMati.status === 200 &&
      redisMati.json?.data?.sumber === "database" &&
      itemsMati.length === items.length &&
      itemsMati.every((entri, i) => entri.attempt_id === items[i].attempt_id),
    `sumber ${redisMati.json?.data?.sumber}, ${itemsMati.length} entri`,
  );

  // ---------------------------------------------- invalidasi setelah submit baru
  const idPemainBaru = await buatPengguna(`peringkat-uji-${stempel}-5@example.com`);
  penggunaUji.push(idPemainBaru);
  const cookieP5 = await login(`peringkat-uji-${stempel}-5@example.com`, "kuiskita-uji-2026");

  // Kunci jawaban dibaca lewat service role (tes butuh jawaban benar).
  const kunciDb = await fetch(
    `${SUPABASE_URL}/rest/v1/question_keys?select=question_id,option_id&question_id=in.(${daftarSoal.map((s) => s.id).join(",")})`,
    { headers: serviceHeaders },
  ).then((r) => r.json());
  const kunciPerSoal = new Map((kunciDb ?? []).map((k) => [k.question_id, k.option_id]));

  const mulai = await api("POST", "/api/attempts", cookieP5, { quiz_id: quizId });
  const attemptBaru = mulai.json?.data?.attempt?.id ?? null;
  report("pemain baru mulai percobaan", mulai.status === 201 && Boolean(attemptBaru), `status ${mulai.status}`);

  for (const soal of daftarSoal) {
    await api("PUT", `/api/attempts/${attemptBaru}/answers`, cookieP5, {
      pertanyaan_id: soal.id,
      opsi_id: kunciPerSoal.get(soal.id),
    });
  }
  const submitBaru = await api("POST", `/api/attempts/${attemptBaru}/submit`, cookieP5);
  report(
    "pemain baru submit (semua benar)",
    submitBaru.status === 200 && Number(submitBaru.json?.data?.persentase) === 100,
    `skor ${submitBaru.json?.data?.skor}, persentase ${submitBaru.json?.data?.persentase}`,
  );

  // Langsung periksa: attempt baru harus terlihat (invalidate setelah submit).
  const sesudahSubmit = await api("GET", `/api/quizzes/${quizId}/leaderboard?limit=10`, cookieP5);
  const itemsSesudah = sesudahSubmit.json?.data?.items ?? [];
  const usernameP5 = `uji${String(idPemainBaru).replace(/\D/g, "").slice(0, 12)}`;
  const entriBaruAda = itemsSesudah.some((entri) => entri.username === usernameP5);
  report(
    "attempt baru langsung tampil setelah submit (cache di-invalidate)",
    sesudahSubmit.status === 200 &&
      itemsSesudah.length === items.length + 1 &&
      entriBaruAda,
    `${itemsSesudah.length} entri (sebelumnya ${items.length})`,
  );
  report(
    "posisi pemain baru terhitung (peringkat 5, skor penuh)",
    sesudahSubmit.json?.data?.saya?.peringkat === 5 &&
      Number(sesudahSubmit.json?.data?.saya?.persentase) === 100,
    `peringkat ${sesudahSubmit.json?.data?.saya?.peringkat}`,
  );

  // ---------------------------------------------- batas & kasus tepi
  const draf = await api("POST", "/api/creator/quizzes", cookieSeed, {
    judul: `Kuis Peringkat Draf ${stempel}`,
    durasi_detik: 120,
    kesulitan: "easy",
  });
  const drafId = draf.json?.data?.id ?? null;
  const peringkatDraf = await api("GET", `/api/quizzes/${drafId}/leaderboard`, null);
  report("leaderboard kuis draf → 404", peringkatDraf.status === 404, `status ${peringkatDraf.status}`);

  const peringkatNgawur = await api("GET", "/api/quizzes/8b6221bc-ca21-4500-a0ea-4ba5a10434e7/leaderboard", null);
  report("leaderboard kuis tak dikenal → 404", peringkatNgawur.status === 404, `status ${peringkatNgawur.status}`);

  const limitNol = await api("GET", `/api/quizzes/${quizId}/leaderboard?limit=0`, null);
  report("limit 0 → 400", limitNol.status === 400, `status ${limitNol.status}`);

  const limitBesar = await api("GET", `/api/quizzes/${quizId}/leaderboard?limit=51`, null);
  report("limit 51 (> batas 50) → 400", limitBesar.status === 400, `status ${limitBesar.status}`);

  const limitTepi = await api("GET", `/api/quizzes/${quizId}/leaderboard?limit=50`, null);
  report("limit 50 (batas atas) → 200", limitTepi.status === 200, `status ${limitTepi.status}`);

  // ---------------------------------------------- bersih-bersih
  for (const id of penggunaUji) {
    await hapusPengguna(id);
  }
  if (drafId) {
    await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${drafId}`, { method: "DELETE", headers: serviceHeaders });
  }
  // Hapus kuis uji terlebih dahulu agar FK attempts ikut terbersihkan.
  if (quizId) {
    await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${quizId}`, { method: "DELETE", headers: serviceHeaders });
  }
  console.log("Bersih-bersih selesai.");
} catch (error) {
  report("eksekusi e2e peringkat", false, error instanceof Error ? error.message : String(error));
}

const gagal = results.filter((r) => !r.ok);
console.log(`\nRingkasan: ${results.length - gagal.length}/${results.length} pemeriksaan lolos.`);
if (gagal.length > 0) {
  console.error("GAGAL:", gagal.map((g) => g.name).join(", "));
  process.exit(1);
}
console.log("E2E peringkat LULUS.");