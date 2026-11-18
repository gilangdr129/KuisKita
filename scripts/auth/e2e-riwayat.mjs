#!/usr/bin/env node
/**
 * E2E riwayat + lihat ulang hasil — Gate F16:
 *   - riwayat hanya milik sendiri (RLS dicoba lintas pengguna)
 *   - attempt expired/submitted tampil benar (skor, persentase, durasi)
 *   - lihat ulang identik dengan halaman hasil F9 (soal + pembahasan)
 *   - attempt belum submit → 403 ATTEMPT_NOT_SUBMITTED
 *
 * Jalankan dev server (npm run dev) dan seed (npm run db:seed) lebih dulu:
 *   node scripts/auth/e2e-riwayat.mjs
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
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
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

async function loginCookie(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/masuk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) return null;
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

/** Access token JWT untuk menguji RLS langsung lewat PostgREST. */
async function loginToken(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return data?.access_token ?? null;
}

function api(method, path, cookie, body) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));
}

function halaman(path, cookie) {
  return fetch(`${BASE_URL}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  }).then(async (res) => ({ status: res.status, teks: await res.text(), lokasi: res.headers.get("location") }));
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
  return id;
}

/**
 * Bersihkan sisa run sebelumnya yang kemungkinan terganggu (timeout/kill):
 * pengguna uji riwayat-uji-% + kuis "Kuis Riwayat%" milik seed beserta
 * attempt & jawabannya. Tanpa ini, attempt lama mengotomi hitungan riwayat.
 */
async function bersihSisaLama() {
  const users = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, { headers: serviceHeaders }).then((r) => r.json());
  for (const user of (users.users ?? []).filter((u) => /^riwayat-uji-.*@example\.com$/.test(u.email ?? ""))) {
    await hapusPengguna(user.id);
  }

  const kuis = await fetch(
    `${SUPABASE_URL}/rest/v1/quizzes?select=id&judul=like.*Kuis%20Riwayat*`,
    { headers: serviceHeaders },
  ).then((r) => r.json());

  for (const baris of kuis ?? []) {
    const attempts = await fetch(`${SUPABASE_URL}/rest/v1/attempts?select=id&quiz_id=eq.${baris.id}`, {
      headers: serviceHeaders,
    }).then((r) => r.json());
    for (const attempt of attempts ?? []) {
      await fetch(`${SUPABASE_URL}/rest/v1/attempt_answers?attempt_id=eq.${attempt.id}`, {
        method: "DELETE",
        headers: serviceHeaders,
      });
    }
    if (attempts?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/attempts?quiz_id=eq.${baris.id}`, { method: "DELETE", headers: serviceHeaders });
    }
    await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${baris.id}`, { method: "DELETE", headers: serviceHeaders });
  }
  return kuis?.length ?? 0;
}

async function hapusPengguna(id) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: serviceHeaders });
}

/** Buat kuis terbit lengkap (draf → soal → kunci → publish). */
async function buatKuisTerbit(cookie, judul, durasiDetik) {
  const kuis = await api("POST", "/api/creator/quizzes", cookie, {
    judul,
    durasi_detik: durasiDetik,
    kesulitan: "easy",
  });
  const quizId = kuis.json?.data?.id ?? null;
  await api("PUT", `/api/creator/quizzes/${quizId}/questions`, cookie, {
    soal: [
      {
        teks: "Soal satu riwayat",
        tipe: "single",
        pembahasan: "Pembahasan soal satu riwayat.",
        opsi: [{ teks: "A1" }, { teks: "B1" }],
      },
      {
        teks: "Soal dua riwayat",
        tipe: "boolean",
        pembahasan: "Pembahasan soal dua riwayat.",
        opsi: [{ teks: "Benar" }, { teks: "Salah" }],
      },
    ],
  });
  const muat = await api("GET", `/api/creator/quizzes/${quizId}/questions`, cookie);
  const daftar = muat.json?.data?.soal ?? [];
  for (const soal of daftar) {
    await api("PUT", `/api/creator/quizzes/${quizId}/kunci`, cookie, {
      question_id: soal.id,
      option_id: soal.opsi[0].id,
    });
  }
  // Kunci dibaca ulang dari DB (service role) agar e2e memakai opsi yang
  // benar-benar tersimpan, bukan asumsi dari urutan opsi di form.
  const kunciDb = await fetch(
    `${SUPABASE_URL}/rest/v1/question_keys?select=question_id,option_id&question_id=in.(${daftar.map((s) => s.id).join(",")})`,
    { headers: serviceHeaders },
  ).then((r) => r.json());
  const kunciPerSoal = new Map((kunciDb ?? []).map((k) => [k.question_id, k.option_id]));
  await api("POST", `/api/creator/quizzes/${quizId}/publish`, cookie);
  return { quizId, daftar, kunciPerSoal };
}

const penggunaUji = [];
const kuisUji = [];

try {
  const stempel = Date.now();
  const sisaLama = await bersihSisaLama();
  if (sisaLama > 0) {
    console.log(`( informasi: ${sisaLama} kuis sisa run sebelumnya dibersihkan )`);
  }

  const cookieA = await loginCookie(SEED_EMAIL, SEED_PASSWORD);
  report("kreator seed (A) bisa masuk", Boolean(cookieA));

  const emailB = `riwayat-uji-b-${stempel}@example.com`;
  const idB = await buatPengguna(emailB);
  penggunaUji.push(idB);
  const cookieB = await loginCookie(emailB, "kuiskita-uji-2026");
  report("pengguna uji B siap", Boolean(cookieB));

  // ---------------------------------------------- kuis uji
  const q1 = await buatKuisTerbit(cookieA, `Kuis Riwayat Satu ${stempel}`, 600);
  const q2 = await buatKuisTerbit(cookieA, `Kuis Riwayat Dua ${stempel}`, 1); // durasi 1 detik → expired
  kuisUji.push(q1.quizId, q2.quizId);
  report("dua kuis uji terbit (normal + durasi 1 detik)", Boolean(q1.quizId && q2.quizId));

  // ---------------------------------------------- A: submitted (1 dari 2 benar)
  const attemptA1 = await api("POST", "/api/attempts", cookieA, { quiz_id: q1.quizId });
  const idA1 = attemptA1.json?.data?.attempt?.id ?? null;
  await api("PUT", `/api/attempts/${idA1}/answers`, cookieA, {
    pertanyaan_id: q1.daftar[0].id,
    opsi_id: q1.kunciPerSoal.get(q1.daftar[0].id),
  });
  await api("PUT", `/api/attempts/${idA1}/answers`, cookieA, {
    pertanyaan_id: q1.daftar[1].id,
    opsi_id: q1.daftar[1].opsi[1].id, // sengaja salah
  });
  const submitA1 = await api("POST", `/api/attempts/${idA1}/submit`, cookieA);
  report(
    "A submit percobaan 1 dari 2 benar",
    submitA1.status === 200 && Number(submitA1.json?.data?.skor) === 1 && Number(submitA1.json?.data?.persentase) === 50,
    `skor ${submitA1.json?.data?.skor}, persentase ${submitA1.json?.data?.persentase}`,
  );

  // ---------------------------------------------- A: expired (1 jawaban benar, waktu habis)
  const attemptA2 = await api("POST", "/api/attempts", cookieA, { quiz_id: q2.quizId });
  const idA2 = attemptA2.json?.data?.attempt?.id ?? null;
  await api("PUT", `/api/attempts/${idA2}/answers`, cookieA, {
    pertanyaan_id: q2.daftar[0].id,
    opsi_id: q2.kunciPerSoal.get(q2.daftar[0].id),
  });
  await new Promise((r) => setTimeout(r, 1500)); // durasi 1 detik → lewat batas
  const submitA2 = await api("POST", `/api/attempts/${idA2}/submit`, cookieA);
  const hasilA2 = submitA2.json?.error?.hasil ?? submitA2.json?.data ?? null;
  report(
    "A submit setelah waktu habis → 409 ATTEMPT_EXPIRED + hasil tetap dinilai",
    submitA2.status === 409 &&
      submitA2.json?.error?.code === "ATTEMPT_EXPIRED" &&
      Number(hasilA2?.skor) === 1,
    `status ${submitA2.status}, skor ${hasilA2?.skor}`,
  );

  // ---------------------------------------------- A: in_progress
  const attemptA3 = await api("POST", "/api/attempts", cookieA, { quiz_id: q1.quizId });
  const idA3 = attemptA3.json?.data?.attempt?.id ?? null;
  report("A punya percobaan yang masih berjalan", attemptA3.status === 201 && Boolean(idA3));

  // ---------------------------------------------- riwayat A (hanya attempt pada kuis uji ini)
  const riwayatA = await api("GET", "/api/me/attempts", cookieA);
  const semuaItemsA = riwayatA.json?.data?.items ?? [];
  // Seed punya attempt dari skenario lain: pengecekan dibatasi pada kuis uji
  // supaya deterministik meski DB dev memuat data lain.
  const itemsA = semuaItemsA.filter(
    (item) => item.quiz_id === q1.quizId || item.quiz_id === q2.quizId,
  );
  const cariA = (id) => itemsA.find((item) => item.id === id) ?? null;
  const barisSubmitted = cariA(idA1);
  const barisExpired = cariA(idA2);
  const barisBerjalan = cariA(idA3);

  report(
    "riwayat A memuat 3 percobaan pada kuis uji",
    riwayatA.status === 200 && itemsA.length === 3,
    `${itemsA.length} baris (dari ${semuaItemsA.length} total milik seed)`,
  );
  report(
    "attempt submitted tampil benar (skor 1, 50%, durasi, judul kuis)",
    barisSubmitted?.status === "submitted" &&
      barisSubmitted?.skor === 1 &&
      barisSubmitted?.persentase === 50 &&
      typeof barisSubmitted?.durasi_ms === "number" &&
      barisSubmitted?.quiz_judul === `Kuis Riwayat Satu ${stempel}`,
    JSON.stringify({ skor: barisSubmitted?.skor, persentase: barisSubmitted?.persentase, judul: barisSubmitted?.quiz_judul }),
  );
  report(
    "attempt expired tampil benar (status expired, skor 1 dari autosave)",
    barisExpired?.status === "expired" && barisExpired?.skor === 1,
    JSON.stringify({ status: barisExpired?.status, skor: barisExpired?.skor }),
  );
  report(
    "attempt in_progress tampil tanpa skor",
    barisBerjalan?.status === "in_progress" && barisBerjalan?.skor === null,
    JSON.stringify({ status: barisBerjalan?.status, skor: barisBerjalan?.skor }),
  );

  // ---------------------------------------------- filter status
  const hanyaSubmitted = await api("GET", "/api/me/attempts?status=submitted", cookieA);
  const hanyaExpired = await api("GET", "/api/me/attempts?status=expired", cookieA);
  const hanyaBerjalan = await api("GET", "/api/me/attempts?status=in_progress", cookieA);
  const filterUji = (respons) =>
    (respons.json?.data?.items ?? []).filter(
      (item) => item.quiz_id === q1.quizId || item.quiz_id === q2.quizId,
    );
  report(
    "filter status bekerja (submitted/expired/in_progress)",
    filterUji(hanyaSubmitted).length === 1 &&
      filterUji(hanyaSubmitted)[0]?.status === "submitted" &&
      filterUji(hanyaExpired).length === 1 &&
      filterUji(hanyaExpired)[0]?.status === "expired" &&
      filterUji(hanyaBerjalan).length === 1 &&
      filterUji(hanyaBerjalan)[0]?.status === "in_progress",
    `S=${filterUji(hanyaSubmitted).length}, E=${filterUji(hanyaExpired).length}, B=${filterUji(hanyaBerjalan).length}`,
  );
  const filterNgawur = await api("GET", "/api/me/attempts?status=sembunyi", cookieA);
  report("filter status tak dikenal → 400", filterNgawur.status === 400, `status ${filterNgawur.status}`);

  // ---------------------------------------------- lihat ulang hasil
  const belumSubmit = await api("GET", `/api/me/attempts/${idA3}`, cookieA);
  report(
    "lihat ulang attempt belum submit → 403 ATTEMPT_NOT_SUBMITTED",
    belumSubmit.status === 403 && belumSubmit.json?.error?.code === "ATTEMPT_NOT_SUBMITTED",
    `status ${belumSubmit.status}, kode ${belumSubmit.json?.error?.code}`,
  );

  const lihatUlang = await api("GET", `/api/me/attempts/${idA1}`, cookieA);
  const dataUlang = lihatUlang.json?.data ?? {};
  const soalUlang = dataUlang.soal ?? [];
  const adaPembahasan = soalUlang.every((soal) => typeof soal.pembahasan === "string" && soal.pembahasan.length > 0);
  report(
    "lihat ulang attempt submitted → 200 + soal & pembahasan lengkap",
    lihatUlang.status === 200 &&
      soalUlang.length === 2 &&
      adaPembahasan &&
      dataUlang.ringkasan?.persentase === 50 &&
      dataUlang.kuis?.judul === `Kuis Riwayat Satu ${stempel}`,
    `${soalUlang.length} soal, pembahasan ${adaPembahasan}`,
  );

  // ---------------------------------------------- identik dengan halaman hasil F9
  const halamanHasil = await halaman(`/percobaan/${idA1}/hasil`, cookieA);
  const teksSoalAda = soalUlang.every((soal) => halamanHasil.teks.includes(soal.teks));
  const pembahasanAda = soalUlang.every((soal) => halamanHasil.teks.includes(soal.pembahasan));
  const persentaseAda = halamanHasil.teks.includes("50");
  report(
    "lihat ulang API identik dengan halaman hasil F9 (soal, pembahasan, skor)",
    halamanHasil.status === 200 && teksSoalAda && pembahasanAda && persentaseAda,
    `status ${halamanHasil.status}, soal ${teksSoalAda}, pembahasan ${pembahasanAda}, skor ${persentaseAda}`,
  );

// ---------------------------------------------- batas lintas pengguna (RLS)
  const riwayatB = await api("GET", "/api/me/attempts", cookieB);
  const itemsB = riwayatB.json?.data?.items ?? [];
  const bocor = itemsA.filter((item) => itemsB.some((milikB) => milikB.id === item.id));
  report(
    "riwayat B tidak memuat percobaan A",
    itemsB.length === 0 && bocor.length === 0,
    `B ${itemsB.length} baris, bocor ${bocor.length}`,
  );

  const lihatUlangB = await api("GET", `/api/me/attempts/${idA1}`, cookieB);
  report(
    "B tidak bisa lihat ulang percobaan A → 404",
    lihatUlangB.status === 404,
    `status ${lihatUlangB.status}`,
  );

  // RLS langsung lewat PostgREST: token A & B hanya melihat attempt milik
  // masing-masing, bahkan ketika difilter ke kuis uji yang sama.
  const tokenA = await loginToken(SEED_EMAIL, SEED_PASSWORD);
  const kuisUjiIn = `in.(${q1.quizId},${q2.quizId})`;
  const rlSA = await fetch(`${SUPABASE_URL}/rest/v1/attempts?select=id,user_id&quiz_id=${kuisUjiIn}`, {
    headers: { apikey: ANON_KEY, authorization: `Bearer ${tokenA}` },
  }).then((r) => r.json());
  const rlsB0 = await fetch(`${SUPABASE_URL}/rest/v1/attempts?select=id,user_id&quiz_id=${kuisUjiIn}`, {
    headers: { apikey: ANON_KEY, authorization: `Bearer ${await loginToken(emailB, "kuiskita-uji-2026")}` },
  }).then((r) => r.json());
  report(
    "RLS attempts: token A hanya melihat attempt miliknya (3 pada kuis uji)",
    Array.isArray(rlSA) && rlSA.length === 3 && rlSA.every((row) => row.user_id !== idB),
    `${rlSA?.length} baris`,
  );
  report(
    "RLS attempts: token B tidak melihat attempt A pada kuis yang sama",
    Array.isArray(rlsB0) && rlsB0.length === 0,
    `${rlsB0?.length} baris`,
  );
  const rlSA1 = await fetch(`${SUPABASE_URL}/rest/v1/attempts?select=id&id=eq.${idA1}`, {
    headers: { apikey: ANON_KEY, authorization: `Bearer ${tokenA}` },
  }).then((r) => r.json());
  report(
    "RLS attempts: membaca attempt sendiri langsung → 1 baris",
    Array.isArray(rlSA1) && rlSA1.length === 1,
    `${rlSA1?.length} baris`,
  );

  // ---------------------------------------------- anon & halaman
  const anonDaftar = await api("GET", "/api/me/attempts", null);
  report("riwayat anon → 401", anonDaftar.status === 401, `status ${anonDaftar.status}`);

  const anonUlang = await api("GET", `/api/me/attempts/${idA1}`, null);
  report("lihat ulang anon → 401", anonUlang.status === 401, `status ${anonUlang.status}`);

  const uuidNgawur = await api("GET", "/api/me/attempts/bukan-uuid", cookieA);
  report("lihat ulang id bukan uuid → 400", uuidNgawur.status === 400, `status ${uuidNgawur.status}`);

  const halamanRiwayat = await halaman("/riwayat", cookieA);
  report(
    "halaman /riwayat memuat percobaan + filter status",
    halamanRiwayat.status === 200 &&
      halamanRiwayat.teks.includes("Riwayat percobaan") &&
      halamanRiwayat.teks.includes("Sedang berjalan") &&
      halamanRiwayat.teks.includes("Kedaluwarsa") &&
      halamanRiwayat.teks.includes(`Kuis Riwayat Satu ${stempel}`),
    `status ${halamanRiwayat.status}`,
  );

  const halamanRiwayatAnon = await halaman("/riwayat", null);
  report(
    "/riwayat tanpa login dialihkan ke /masuk",
    (halamanRiwayatAnon.status === 307 || halamanRiwayatAnon.status === 302) &&
      (halamanRiwayatAnon.lokasi ?? "").includes("/masuk"),
    `status ${halamanRiwayatAnon.status}, lokasi ${halamanRiwayatAnon.lokasi}`,
  );

  // ---------------------------------------------- bersih-bersih
  // Urutan penting: jawaban → percobaan → kuis. Menghapus kuis yang masih
  // punya percobaan hanya men-SUSPEND kuis (trigger DB), bukan menghapusnya.
  for (const id of kuisUji) {
    const attempts = await fetch(`${SUPABASE_URL}/rest/v1/attempts?select=id&quiz_id=eq.${id}`, {
      headers: serviceHeaders,
    }).then((r) => r.json());
    for (const attempt of attempts ?? []) {
      await fetch(`${SUPABASE_URL}/rest/v1/attempt_answers?attempt_id=eq.${attempt.id}`, {
        method: "DELETE",
        headers: serviceHeaders,
      });
    }
    if (attempts?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/attempts?quiz_id=eq.${id}`, {
        method: "DELETE",
        headers: serviceHeaders,
      });
    }
    await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${id}`, { method: "DELETE", headers: serviceHeaders });
  }
  for (const id of penggunaUji) {
    await hapusPengguna(id);
  }
  console.log("Bersih-bersih selesai.");
} catch (error) {
  report("eksekusi e2e riwayat", false, error instanceof Error ? error.message : String(error));
}

const gagal = results.filter((r) => !r.ok);
console.log(`\nRingkasan: ${results.length - gagal.length}/${results.length} pemeriksaan lolos.`);
if (gagal.length > 0) {
  console.error("GAGAL:", gagal.map((g) => g.name).join(", "));
  process.exit(1);
}
console.log("E2E riwayat LULUS.");