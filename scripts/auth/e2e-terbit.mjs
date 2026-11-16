#!/usr/bin/env node
/**
 * E2E terbit + duplikasi — Gate F14:
 *   - publish sukses → muncul di katalog < 60 detik (revalidasi on-demand)
 *   - soal tanpa kunci → 409 dengan pesan spesifik per soal
 *   - validasi terbit lain: tanpa soal, opsi < 2, gambar bukan dari media-kuis
 *   - duplikasi menghasilkan draft utuh (metadata + soal + opsi + kunci, tanpa attempt)
 *   - lock struktural tetap terverifikasi: sumber terdampak attempt → 409,
 *     sementara duplikasi tetap bisa dibuat (jalur versi baru, D4)
 *
 * Jalankan dev server (npm run dev) dan seed (npm run db:seed) lebih dulu:
 *   node scripts/auth/e2e-terbit.mjs
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

async function buatPengguna(email, role) {
  const dibuat = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({ email, password: "kuiskita-uji-2026", email_confirm: true }),
  });
  const user = await dibuat.json();
  const id = user?.id;
  if (!id) throw new Error(`gagal membuat pengguna ${email}`);
  if (role) {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}`, {
      method: "PATCH",
      headers: serviceHeaders,
      body: JSON.stringify({ role }),
    });
  }
  return id;
}

async function hapusPengguna(id) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: serviceHeaders });
}

/** Buat kuis draf lewat API (F12). */
async function buatKuis(cookie, judul) {
  return api("POST", "/api/creator/quizzes", cookie, {
    judul,
    durasi_detik: 300,
    kesulitan: "easy",
  });
}

/** Simpan 2 soal standar; opsi ke-3 opsional untuk skenario tanpa kunci. */
function strukturDuaSoal(teksKetiga) {
  const soal = [
    { teks: "Soal satu: 2+2?", tipe: "single", opsi: [{ teks: "3" }, { teks: "4" }] },
    { teks: "Soal dua: benar atau salah?", tipe: "boolean", opsi: [{ teks: "Benar" }, { teks: "Salah" }] },
  ];
  if (teksKetiga) {
    soal.push({ teks: teksKetiga, tipe: "single", opsi: [{ teks: "A" }, { teks: "B" }] });
  }
  return { soal };
}

/** Kunci untuk tiap soal pada array struktur (indeks opsi 0). */
async function pasangKunci(cookie, quizId, jumlahSoal) {
  const soal = await api("GET", `/api/creator/quizzes/${quizId}/questions`, cookie);
  const daftar = soal.json?.data?.soal ?? [];
  for (let i = 0; i < Math.min(jumlahSoal, daftar.length); i += 1) {
    await api("PUT", `/api/creator/quizzes/${quizId}/kunci`, cookie, {
      question_id: daftar[i].id,
      option_id: daftar[i].opsi[0].id,
    });
  }
  return daftar;
}

/** Bersihkan total sebuah kuis: jawaban → percobaan → kuis. */
async function hapusKuisTotal(quizId) {
  if (!quizId) return;
  const attempts = await fetch(`${SUPABASE_URL}/rest/v1/attempts?select=id&quiz_id=eq.${quizId}`, {
    headers: serviceHeaders,
  }).then((r) => r.json());
  for (const a of attempts ?? []) {
    await fetch(`${SUPABASE_URL}/rest/v1/attempt_answers?attempt_id=eq.${a.id}`, {
      method: "DELETE",
      headers: serviceHeaders,
    });
  }
  if (attempts?.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/attempts?quiz_id=eq.${quizId}`, {
      method: "DELETE",
      headers: serviceHeaders,
    });
  }
  await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${quizId}`, { method: "DELETE", headers: serviceHeaders });
}

const kuisUji = [];
const penggunaUji = [];

try {
  const stempel = Date.now();
  const cookieSeed = await login(SEED_EMAIL, SEED_PASSWORD);
  report("kreator seed bisa masuk", Boolean(cookieSeed));

  const idPemain = await buatPengguna(`terbit-uji-pemain-${stempel}@example.com`, null);
  const idKreatorB = await buatPengguna(`terbit-uji-b-${stempel}@example.com`, "creator");
  penggunaUji.push(idPemain, idKreatorB);
  const cookiePemain = await login(`terbit-uji-pemain-${stempel}@example.com`, "kuiskita-uji-2026");
  const cookieB = await login(`terbit-uji-b-${stempel}@example.com`, "kuiskita-uji-2026");
  report("pengguna uji siap (pemain + kreator B)", Boolean(cookiePemain && cookieB));

  // ---------------------------------------------- 1) tanpa soal → 409
  const kuisKosong = await buatKuis(cookieSeed, `Kuis Kosong Uji ${stempel}`);
  const kuisKosongId = kuisKosong.json?.data?.id ?? null;
  kuisUji.push(kuisKosongId);
  const terbitKosong = await api("POST", `/api/creator/quizzes/${kuisKosongId}/publish`, cookieSeed);
  report(
    "publish tanpa soal → 409 PUBLISH_NO_QUESTIONS",
    terbitKosong.status === 409 && terbitKosong.json?.error?.code === "PUBLISH_NO_QUESTIONS",
    `status ${terbitKosong.status}, kode ${terbitKosong.json?.error?.code}`,
  );

  // ---------------------------------------------- 2) soal tanpa kunci → 409 spesifik
  const kuisTanpaKunci = await buatKuis(cookieSeed, `Kuis Tanpa Kunci Uji ${stempel}`);
  const kuisTanpaKunciId = kuisTanpaKunci.json?.data?.id ?? null;
  kuisUji.push(kuisTanpaKunciId);
  await api("PUT", `/api/creator/quizzes/${kuisTanpaKunciId}/questions`, cookieSeed, strukturDuaSoal("Soal tiga tanpa kunci"));
  await pasangKunci(cookieSeed, kuisTanpaKunciId, 2); // hanya 2 dari 3 soal

  const terbitTanpaKunci = await api("POST", `/api/creator/quizzes/${kuisTanpaKunciId}/publish`, cookieSeed);
  const pesanTanpaKunci = terbitTanpaKunci.json?.error?.message ?? "";
  report(
    "publish dengan soal tanpa kunci → 409 PUBLISH_MISSING_KEYS",
    terbitTanpaKunci.status === 409 && terbitTanpaKunci.json?.error?.code === "PUBLISH_MISSING_KEYS",
    `status ${terbitTanpaKunci.status}, kode ${terbitTanpaKunci.json?.error?.code}`,
  );
  report(
    "pesan menyebut soal yang bermasalah (spesifik per soal)",
    pesanTanpaKunci.includes("soal ke-3") && pesanTanpaKunci.includes("Soal tiga tanpa kunci"),
    pesanTanpaKunci.slice(0, 120),
  );

  // ---------------------------------------------- 3) publish sukses
  await pasangKunci(cookieSeed, kuisTanpaKunciId, 3);
  const terbitSukses = await api("POST", `/api/creator/quizzes/${kuisTanpaKunciId}/publish`, cookieSeed);
  const publishedAt = terbitSukses.json?.data?.published_at ?? null;
  report(
    "publish lengkap → 200 + status published + published_at",
    terbitSukses.status === 200 &&
      terbitSukses.json?.data?.status === "published" &&
      Boolean(publishedAt),
    `status ${terbitSukses.status}, published_at ${publishedAt}`,
  );

  // ---------------------------------------------- 4) muncul di katalog < 60 detik
  const judulKatalog = String(kuisTanpaKunci.json?.data?.judul ?? "");
  const mulaiHitung = Date.now();
  let muncul = false;
  let menit = 0;
  while (Date.now() - mulaiHitung < 60_000) {
    const katalog = await api("GET", `/api/quizzes?q=${encodeURIComponent(judulKatalog)}`, null);
    const item = (katalog.json?.data?.items ?? []).find((k) => k.judul === judulKatalog);
    if (item) {
      muncul = true;
      menit = Math.round((Date.now() - mulaiHitung) / 100) / 10;
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  report("kuis terbit muncul di katalog < 60 detik", muncul, muncul ? `${menit} detik` : "tidak muncul");

  const halamanKuis = await fetch(`${BASE_URL}/kuis/${kuisTanpaKunciId}`);
  const htmlKuis = await halamanKuis.text();
  report(
    "halaman detail publik bisa diakses setelah terbit",
    halamanKuis.status === 200 && htmlKuis.includes(judulKatalog),
    `status ${halamanKuis.status}`,
  );

  // ---------------------------------------------- 5) publish idempoten
  const terbitLagi = await api("POST", `/api/creator/quizzes/${kuisTanpaKunciId}/publish`, cookieSeed);
  report(
    "publish ulang → 200 idempoten (sudah_terbit)",
    terbitLagi.status === 200 && terbitLagi.json?.data?.sudah_terbit === true,
    `sudah_terbit ${terbitLagi.json?.data?.sudah_terbit}`,
  );

  // ---------------------------------------------- 6) gambar bukan dari media-kuis
  const kuisGambar = await buatKuis(cookieSeed, `Kuis Gambar Asing Uji ${stempel}`);
  const kuisGambarId = kuisGambar.json?.data?.id ?? null;
  kuisUji.push(kuisGambarId);
  await api("PUT", `/api/creator/quizzes/${kuisGambarId}/questions`, cookieSeed, {
    soal: [
      {
        teks: "Soal bergambar asing",
        tipe: "single",
        opsi: [{ teks: "A" }, { teks: "B" }],
        gambar_url: "https://contoh.test/gambar.png",
      },
    ],
  });
  await pasangKunci(cookieSeed, kuisGambarId, 1);
  const terbitGambar = await api("POST", `/api/creator/quizzes/${kuisGambarId}/publish`, cookieSeed);
  report(
    "publish dengan gambar di luar media-kuis → 409 PUBLISH_INVALID_IMAGE",
    terbitGambar.status === 409 && terbitGambar.json?.error?.code === "PUBLISH_INVALID_IMAGE",
    `status ${terbitGambar.status}, kode ${terbitGambar.json?.error?.code}`,
  );

  // ---------------------------------------------- 7) duplikasi menghasilkan draft utuh
  const duplikat = await api("POST", `/api/creator/quizzes/${kuisTanpaKunciId}/duplicate`, cookieSeed);
  const duplikatId = duplikat.json?.data?.id ?? null;
  kuisUji.push(duplikatId);
  report(
    "duplikasi → 201 + judul '(salinan)' + status draft",
    duplikat.status === 201 &&
      duplikat.json?.data?.status === "draft" &&
      String(duplikat.json?.data?.judul ?? "").includes("(salinan)"),
    `${duplikat.json?.data?.judul ?? "-"}`,
  );

  // Verifikasi isi salinan lewat service role (RLS dilewati sebagai admin).
  const strukturSumber = await fetch(
    `${SUPABASE_URL}/rest/v1/questions?select=id,teks,bobot,pembahasan,urutan,options(id,teks,urutan)&quiz_id=eq.${kuisTanpaKunciId}&order=urutan`,
    { headers: serviceHeaders },
  ).then((r) => r.json());
  const strukturSalinan = await fetch(
    `${SUPABASE_URL}/rest/v1/questions?select=id,teks,bobot,pembahasan,urutan,options(id,teks,urutan)&quiz_id=eq.${duplikatId}&order=urutan`,
    { headers: serviceHeaders },
  ).then((r) => r.json());
  const kunciSumber = await fetch(
    `${SUPABASE_URL}/rest/v1/question_keys?select=question_id,option_id&question_id=in.(${(strukturSumber ?? []).map((q) => q.id).join(",")})`,
    { headers: serviceHeaders },
  ).then((r) => r.json());
  const kunciSalinan = await fetch(
    `${SUPABASE_URL}/rest/v1/question_keys?select=question_id,option_id&question_id=in.(${(strukturSalinan ?? []).map((q) => q.id).join(",")})`,
    { headers: serviceHeaders },
  ).then((r) => r.json());
  const attemptSalinan = await fetch(
    `${SUPABASE_URL}/rest/v1/attempts?select=id&quiz_id=eq.${duplikatId}`,
    { headers: serviceHeaders },
  ).then((r) => r.json());

  const jumlahOpsi = (daftar) => (daftar ?? []).reduce((total, q) => total + (q.options?.length ?? 0), 0);
  const salinanUtuh =
    (strukturSalinan ?? []).length === (strukturSumber ?? []).length &&
    jumlahOpsi(strukturSalinan) === jumlahOpsi(strukturSumber) &&
    (kunciSalinan ?? []).length === (kunciSumber ?? []).length &&
    (strukturSalinan ?? []).every((q, i) => q.teks === strukturSumber[i].teks && q.bobot === strukturSumber[i].bobot);
  report(
    "duplikat utuh: soal + opsi + kunci sama banyak, teks & bobot identik",
    salinanUtuh,
    `soal ${(strukturSalinan ?? []).length}/${(strukturSumber ?? []).length}, opsi ${jumlahOpsi(strukturSalinan)}/${jumlahOpsi(strukturSumber)}, kunci ${(kunciSalinan ?? []).length}/${(kunciSumber ?? []).length}`,
  );
  report("duplikat tanpa percobaan", (attemptSalinan ?? []).length === 0, `${(attemptSalinan ?? []).length} attempt`);

  const statusSumber = await fetch(
    `${SUPABASE_URL}/rest/v1/quizzes?select=status&id=eq.${kuisTanpaKunciId}`,
    { headers: serviceHeaders },
  ).then((r) => r.json());
  report(
    "kuis sumber tetap terbit & utuh",
    statusSumber?.[0]?.status === "published" && salinanUtuh,
    `status ${statusSumber?.[0]?.status}`,
  );

  // ---------------------------------------------- 8) lock struktural + duplikasi sebagai jalan keluar
  const attempt = await api("POST", "/api/attempts", cookieSeed, { quiz_id: kuisTanpaKunciId });
  report("percobaan dimulai pada kuis sumber", attempt.status === 201, `status ${attempt.status}`);

  const ubahStruktur = await api("PUT", `/api/creator/quizzes/${kuisTanpaKunciId}/questions`, cookieSeed, { soal: [] });
  report(
    "struktur sumber terkunci setelah dikerjakan → 409 STRUCTURE_LOCKED",
    ubahStruktur.status === 409 && ubahStruktur.json?.error?.code === "STRUCTURE_LOCKED",
    `status ${ubahStruktur.status}, kode ${ubahStruktur.json?.error?.code}`,
  );

  const duplikatTerkunci = await api("POST", `/api/creator/quizzes/${kuisTanpaKunciId}/duplicate`, cookieSeed);
  const duplikatTerkunciId = duplikatTerkunci.json?.data?.id ?? null;
  kuisUji.push(duplikatTerkunciId);
  report(
    "duplikasi kuis yang sudah dikerjakan tetap berhasil (D4)",
    duplikatTerkunci.status === 201 && Boolean(duplikatTerkunciId),
    `status ${duplikatTerkunci.status}`,
  );

  // ---------------------------------------------- 9) kontrol akses
  const anonTerbit = await api("POST", `/api/creator/quizzes/${kuisTanpaKunciId}/publish`, null);
  report("publish anon → 401", anonTerbit.status === 401, `status ${anonTerbit.status}`);

  const pemainTerbit = await api("POST", `/api/creator/quizzes/${kuisTanpaKunciId}/publish`, cookiePemain);
  report("publish pemain → 403", pemainTerbit.status === 403, `status ${pemainTerbit.status}`);

  const kuisB = await buatKuis(cookieB, `Kuis Milik B ${stempel}`);
  const kuisBId = kuisB.json?.data?.id ?? null;
  kuisUji.push(kuisBId);

  const seedTerbitkanB = await api("POST", `/api/creator/quizzes/${kuisBId}/publish`, cookieSeed);
  report("publish kuis kreator lain → 404", seedTerbitkanB.status === 404, `status ${seedTerbitkanB.status}`);

  const seedDuplikatB = await api("POST", `/api/creator/quizzes/${kuisBId}/duplicate`, cookieSeed);
  report("duplikasi kuis kreator lain → 404", seedDuplikatB.status === 404, `status ${seedDuplikatB.status}`);

  const anonDuplikat = await api("POST", `/api/creator/quizzes/${kuisTanpaKunciId}/duplicate`, null);
  report("duplikasi anon → 401", anonDuplikat.status === 401, `status ${anonDuplikat.status}`);

  // ---------------------------------------------- bersih-bersih
  for (const id of kuisUji) {
    await hapusKuisTotal(id);
  }
  for (const id of penggunaUji) {
    await hapusPengguna(id);
  }
  console.log(`Bersih-bersih selesai (${kuisUji.length} kuis uji).`);
} catch (error) {
  report("eksekusi e2e terbit", false, error instanceof Error ? error.message : String(error));
}

const gagal = results.filter((r) => !r.ok);
console.log(`\nRingkasan: ${results.length - gagal.length}/${results.length} pemeriksaan lolos.`);
if (gagal.length > 0) {
  console.error("GAGAL:", gagal.map((g) => g.name).join(", "));
  process.exit(1);
}
console.log("E2E terbit LULUS.");