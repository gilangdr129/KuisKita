#!/usr/bin/env node
/**
 * E2E admin — Gate F17:
 *   - suspend oleh admin → hilang dari katalog & detail tamu < 60 detik
 *   - audit_logs bertambah (actor, aksi, target, data lama/baru, alasan)
 *   - notifikasi email dicatat (best-effort; terkirim bila RESEND_API_KEY ada)
 *   - suspend kedua idempoten (tanpa audit/email baru)
 *   - halaman admin hanya untuk admin; laporan kuis tersimpan & tampil
 *
 * Jalankan dev server (npm run dev) dan seed (npm run db:seed) lebih dulu:
 *   node scripts/auth/e2e-admin.mjs
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

function halaman(path, cookie) {
  return fetch(`${BASE_URL}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  }).then(async (res) => ({ status: res.status, teks: await res.text(), lokasi: res.headers.get("location") }));
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

async function buatKuisTerbit(cookie, judul) {
  const kuis = await api("POST", "/api/creator/quizzes", cookie, {
    judul,
    durasi_detik: 300,
    kesulitan: "easy",
  });
  const quizId = kuis.json?.data?.id ?? null;
  await api("PUT", `/api/creator/quizzes/${quizId}/questions`, cookie, {
    soal: [{ teks: "Soal moderasi", tipe: "single", opsi: [{ teks: "A" }, { teks: "B" }] }],
  });
  const muat = await api("GET", `/api/creator/quizzes/${quizId}/questions`, cookie);
  const soal = (muat.json?.data?.soal ?? [])[0];
  await api("PUT", `/api/creator/quizzes/${quizId}/kunci`, cookie, {
    question_id: soal.id,
    option_id: soal.opsi[0].id,
  });
  await api("POST", `/api/creator/quizzes/${quizId}/publish`, cookie);
  return { quizId, judul };
}

const penggunaUji = [];
let quizId = null;

/** Bersihkan sisa run terganggu: pengguna admin-uji-% + kuis Moderasi Uji%. */
async function bersihSisaLama() {
  const users = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, { headers: serviceHeaders }).then((r) => r.json());
  for (const user of (users.users ?? []).filter((u) => /^admin-uji-.*@example\.com$/.test(u.email ?? ""))) {
    await hapusPengguna(user.id);
  }
  const kuis = await fetch(
    `${SUPABASE_URL}/rest/v1/quizzes?select=id&judul=like.*Kuis%20Moderasi%20Uji*`,
    { headers: serviceHeaders },
  ).then((r) => r.json());
  for (const baris of kuis ?? []) {
    await fetch(`${SUPABASE_URL}/rest/v1/reports?quiz_id=eq.${baris.id}`, { method: "DELETE", headers: serviceHeaders });
    const attempts = await fetch(`${SUPABASE_URL}/rest/v1/attempts?select=id&quiz_id=eq.${baris.id}`, { headers: serviceHeaders }).then((r) => r.json());
    for (const attempt of attempts ?? []) {
      await fetch(`${SUPABASE_URL}/rest/v1/attempt_answers?attempt_id=eq.${attempt.id}`, { method: "DELETE", headers: serviceHeaders });
    }
    if (attempts?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/attempts?quiz_id=eq.${baris.id}`, { method: "DELETE", headers: serviceHeaders });
    }
    await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${baris.id}`, { method: "DELETE", headers: serviceHeaders });
  }
}

try {
  const stempel = Date.now();
  await bersihSisaLama();
  const cookieSeed = await login(SEED_EMAIL, SEED_PASSWORD);
  report("kreator seed bisa masuk", Boolean(cookieSeed));

  const idAdmin = await buatPengguna(`admin-uji-${stempel}@example.com`, "admin");
  const idPemain = await buatPengguna(`admin-uji-pemain-${stempel}@example.com`, null);
  penggunaUji.push(idAdmin, idPemain);
  const cookieAdmin = await login(`admin-uji-${stempel}@example.com`, "kuiskita-uji-2026");
  const cookiePemain = await login(`admin-uji-pemain-${stempel}@example.com`, "kuiskita-uji-2026");
  report("admin + pemain uji siap", Boolean(cookieAdmin && cookiePemain));

  // ---------------------------------------------- kuis terbit + laporan
  const kuis = await buatKuisTerbit(cookieSeed, `Kuis Moderasi Uji ${stempel}`);
  quizId = kuis.quizId;
  report("kuis uji terbit", Boolean(quizId));

  const katalogAwal = await api("GET", `/api/quizzes?q=${encodeURIComponent(kuis.judul)}`, null);
  report(
    "kuis tampil di katalog sebelum suspend",
    (katalogAwal.json?.data?.items ?? []).some((item) => item.judul === kuis.judul),
    `${(katalogAwal.json?.data?.items ?? []).length} hasil`,
  );

  const lapor = await api("POST", "/api/reports", cookiePemain, {
    quiz_id: quizId,
    alasan: "Konten uji laporan: soal tidak pantas.",
  });
  report(
    "pemain melaporkan kuis → 201",
    lapor.status === 201 && lapor.json?.data?.quiz_id === quizId && lapor.json?.data?.status === "open",
    `status ${lapor.status}`,
  );

  const laporAnon = await api("POST", "/api/reports", null, { quiz_id: quizId, alasan: "uji anon" });
  report("laporan anon → 401", laporAnon.status === 401, `status ${laporAnon.status}`);

  // ---------------------------------------------- kontrol akses suspend
  const suspendAnon = await api("PATCH", `/api/admin/quizzes/${quizId}/suspend`, null, {});
  report("suspend anon → 401", suspendAnon.status === 401, `status ${suspendAnon.status}`);

  const suspendPemain = await api("PATCH", `/api/admin/quizzes/${quizId}/suspend`, cookiePemain, {});
  report("suspend oleh pemain → 403", suspendPemain.status === 403, `status ${suspendPemain.status}`);

  const suspendKreator = await api("PATCH", `/api/admin/quizzes/${quizId}/suspend`, cookieSeed, {});
  report("suspend oleh kreator non-admin → 403", suspendKreator.status === 403, `status ${suspendKreator.status}`);

  // ---------------------------------------------- suspend oleh admin
  const alasanUji = "Melanggar aturan konten (uji).";
  const mulaiHitung = Date.now();
  const suspend = await api("PATCH", `/api/admin/quizzes/${quizId}/suspend`, cookieAdmin, { alasan: alasanUji });
  const notifikasi = suspend.json?.data?.notifikasi ?? {};
  report(
    "admin suspend → 200 status suspended + notifikasi tercatat",
    suspend.status === 200 &&
      suspend.json?.data?.status === "suspended" &&
      suspend.json?.data?.sudah_tangguh === false &&
      typeof notifikasi.terkirim === "boolean" &&
      typeof notifikasi.alasan === "string",
    JSON.stringify(notifikasi).slice(0, 140),
  );

  // ---------------------------------------------- hilang < 60 detik
  let hilangKatalog = false;
  let hilangDetail = false;
  let detik = 0;
  while (Date.now() - mulaiHitung < 60_000) {
    const katalog = await api("GET", `/api/quizzes?q=${encodeURIComponent(kuis.judul)}`, null);
    const masihAda = (katalog.json?.data?.items ?? []).some((item) => item.judul === kuis.judul);
    const detail = await fetch(`${BASE_URL}/kuis/${quizId}`);
    hilangKatalog = !masihAda;
    hilangDetail = detail.status === 404;
    if (hilangKatalog && hilangDetail) {
      detik = Math.round((Date.now() - mulaiHitung) / 100) / 10;
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  report(
    "suspend → hilang dari katalog & detail tamu < 60 detik",
    hilangKatalog && hilangDetail,
    `${detik} detik (katalog ${hilangKatalog}, detail ${hilangDetail})`,
  );

  const statusDb = await fetch(`${SUPABASE_URL}/rest/v1/quizzes?select=status,visibilitas&id=eq.${quizId}`, {
    headers: serviceHeaders,
  }).then((r) => r.json());
  report(
    "status di DB: suspended + private",
    statusDb?.[0]?.status === "suspended" && statusDb?.[0]?.visibilitas === "private",
    JSON.stringify(statusDb?.[0]),
  );

  // ---------------------------------------------- audit_logs
  const audit = await fetch(
    `${SUPABASE_URL}/rest/v1/audit_logs?select=actor_id,aksi,target_type,target_id,metadata&actor_id=eq.${idAdmin}&target_id=eq.${quizId}`,
    { headers: serviceHeaders },
  ).then((r) => r.json());
  const barisAudit = (audit ?? []).filter((row) => row.aksi === "quiz.suspend");
  report(
    "audit_logs bertambah: actor admin, aksi quiz.suspend, target kuis",
    barisAudit.length === 1 &&
      barisAudit[0]?.target_type === "quizzes" &&
      barisAudit[0]?.metadata?.data_lama?.status === "published" &&
      barisAudit[0]?.metadata?.data_baru?.status === "suspended" &&
      barisAudit[0]?.metadata?.data_baru?.alasan === alasanUji,
    `${barisAudit.length} baris`,
  );

  // ---------------------------------------------- suspend kedua idempoten
  const suspendKedua = await api("PATCH", `/api/admin/quizzes/${quizId}/suspend`, cookieAdmin, { alasan: alasanUji });
  const auditKedua = await fetch(
    `${SUPABASE_URL}/rest/v1/audit_logs?select=id&actor_id=eq.${idAdmin}&target_id=eq.${quizId}`,
    { headers: serviceHeaders },
  ).then((r) => r.json());
  report(
    "suspend kedua → 200 sudah_tangguh + tanpa audit/email baru",
    suspendKedua.status === 200 &&
      suspendKedua.json?.data?.sudah_tangguh === true &&
      (auditKedua ?? []).length === 1 &&
      suspendKedua.json?.data?.notifikasi?.terkirim === false,
    `audit ${auditKedua?.length} baris, notifikasi: ${suspendKedua.json?.data?.notifikasi?.alasan}`,
  );

  // ---------------------------------------------- halaman admin
  const halamanAdmin = await halaman("/admin", cookieAdmin);
  report(
    "halaman /admin memuat daftar kuis + pengguna + laporan",
    halamanAdmin.status === 200 &&
      halamanAdmin.teks.includes("Kuis Moderasi Uji") &&
      halamanAdmin.teks.includes("Pengguna") &&
      halamanAdmin.teks.includes("Laporan") &&
      halamanAdmin.teks.includes("Konten uji laporan"),
    `status ${halamanAdmin.status}`,
  );

  const halamanAdminPemain = await halaman("/admin", cookiePemain);
  report(
    "halaman /admin untuk non-admin menolak akses",
    halamanAdminPemain.status === 200 && halamanAdminPemain.teks.includes("khusus admin"),
    `status ${halamanAdminPemain.status}`,
  );

  const halamanAdminAnon = await halaman("/admin", null);
  report(
    "/admin tanpa login dialihkan ke /masuk",
    (halamanAdminAnon.status === 307 || halamanAdminAnon.status === 302) &&
      (halamanAdminAnon.lokasi ?? "").includes("/masuk"),
    `status ${halamanAdminAnon.status}, lokasi ${halamanAdminAnon.lokasi}`,
  );

  // ---------------------------------------------- bersih-bersih
  await fetch(`${SUPABASE_URL}/rest/v1/reports?quiz_id=eq.${quizId}`, { method: "DELETE", headers: serviceHeaders });
  await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${quizId}`, { method: "DELETE", headers: serviceHeaders });
  for (const id of penggunaUji) {
    await hapusPengguna(id);
  }
  console.log("Bersih-bersih selesai.");
} catch (error) {
  report("eksekusi e2e admin", false, error instanceof Error ? error.message : String(error));
}

const gagal = results.filter((r) => !r.ok);
console.log(`\nRingkasan: ${results.length - gagal.length}/${results.length} pemeriksaan lolos.`);
if (gagal.length > 0) {
  console.error("GAGAL:", gagal.map((g) => g.name).join(", "));
  process.exit(1);
}
console.log("E2E admin LULUS.");