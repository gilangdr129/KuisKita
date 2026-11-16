#!/usr/bin/env node
/**
 * E2E dasbor kreator (Gate F12):
 *   - CRUD kuis: buat (selalu draf), ubah metadata, hapus draf, tangguhkan terbit
 *   - validasi: judul 3–120, deskripsi ≤ 2000, durasi > 0, kesulitan, kategori,
 *     visibilitas, maks_percobaan
 *   - keamanan: kuis orang lain → 404 (PATCH/DELETE/halaman edit), daftar hanya
 *     milik sendiri, pemain → 403, anon → 401, halaman dasbor butuh login
 *
 * Jalankan dev server (npm run dev) dan seed (npm run db:seed) lebih dulu:
 *   node scripts/auth/e2e-creator.mjs
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

/** Buat pengguna uji lewat admin API; peran diset langsung (default pemain). */
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

/** Cek keberadaan kuis lewat service role (RLS dilewati). */
async function kuisAda(id) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/quizzes?select=id,status,visibilitas&id=eq.${id}`,
    { headers: serviceHeaders },
  );
  const rows = await res.json();
  return rows?.[0] ?? null;
}

/** Terbitkan kuis langsung lewat service role (menyimulasikan kuis terbit). */
async function terbitkan(id) {
  await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${id}`, {
    method: "PATCH",
    headers: serviceHeaders,
    body: JSON.stringify({
      status: "published",
      visibilitas: "public",
      published_at: new Date().toISOString(),
    }),
  });
}

try {
  const stempel = Date.now();
  const emailPemain = `kreator-uji-pemain-${stempel}@example.com`;
  const emailKreatorB = `kreator-uji-b-${stempel}@example.com`;

  // ---------------------------------------------- sesi & pengguna uji
  const cookieSeed = await login(SEED_EMAIL, SEED_PASSWORD);
  report("kreator seed bisa masuk", Boolean(cookieSeed));

  const idPemain = await buatPengguna(emailPemain, null);
  const idKreatorB = await buatPengguna(emailKreatorB, "creator");
  const cookiePemain = await login(emailPemain, "kuiskita-uji-2026");
  const cookieB = await login(emailKreatorB, "kuiskita-uji-2026");
  report("pengguna uji (pemain + kreator B) siap", Boolean(cookiePemain && cookieB));

  const kuisValid = {
    judul: "Kuis Dasbor Uji",
    deskripsi: "Kuis untuk menguji dasbor kreator.",
    durasi_detik: 600,
    kesulitan: "medium",
    kategori: "sains",
    acak_soal: true,
    maks_percobaan: 3,
    visibilitas: "unlisted",
  };

  // ---------------------------------------------- buat kuis (valid)
  const bentukBenar = (data) =>
    Boolean(data?.id) && typeof data.id === "string" && data.judul === kuisValid.judul;

  const dibuat = await api("POST", "/api/creator/quizzes", cookieSeed, kuisValid);
  report(
    "POST kuis valid → 201 draf",
    dibuat.status === 201 && dibuat.json?.data?.status === "draft" && bentukBenar(dibuat.json?.data),
    `status ${dibuat.status}, status kuis ${dibuat.json?.data?.status}`,
  );
  const kuisUtamaId = dibuat.json?.data?.id ?? null;
  report(
    "kategori/visibilitas/acak/maks tersimpan sesuai kiriman",
    dibuat.json?.data?.kategori?.slug === "sains" &&
      dibuat.json?.data?.maks_percobaan === 3 &&
      dibuat.json?.data?.acak_soal === true &&
      dibuat.json?.data?.acak_opsi === false &&
      dibuat.json?.data?.visibilitas === "unlisted",
    JSON.stringify({
      kategori: dibuat.json?.data?.kategori?.slug,
      maks: dibuat.json?.data?.maks_percobaan,
      visibilitas: dibuat.json?.data?.visibilitas,
    }),
  );

  // ---------------------------------------------- validasi input
  const kasusValidasi = [
    ["judul 2 karakter", { ...kuisValid, judul: "ab" }],
    ["judul 121 karakter", { ...kuisValid, judul: "a".repeat(121) }],
    ["deskripsi 2001 karakter", { ...kuisValid, deskripsi: "a".repeat(2001) }],
    ["durasi 0 detik", { ...kuisValid, durasi_detik: 0 }],
    ["durasi negatif", { ...kuisValid, durasi_detik: -30 }],
    ["durasi bukan bilangan bulat", { ...kuisValid, durasi_detik: 90.5 }],
    ["kesulitan di luar daftar", { ...kuisValid, kesulitan: "sulit" }],
    ["kategori tidak dikenal", { ...kuisValid, kategori: "slug-ngawur" }],
    ["maks_percobaan 0", { ...kuisValid, maks_percobaan: 0 }],
    ["visibilitas tidak dikenal", { ...kuisValid, visibilitas: "rahasia" }],
    ["judul hilang", { deskripsi: "x", durasi_detik: 60, kesulitan: "easy" }],
  ];

  for (const [nama, body] of kasusValidasi) {
    const res = await api("POST", "/api/creator/quizzes", cookieSeed, body);
    report(
      `validasi: ${nama} → 400`,
      res.status === 400 && res.json?.error?.code === "VALIDATION_ERROR",
      `status ${res.status}, kode ${res.json?.error?.code}`,
    );
  }

  const anonBuat = await api("POST", "/api/creator/quizzes", null, kuisValid);
  report("anon membuat kuis → 401", anonBuat.status === 401, `status ${anonBuat.status}`);

  const pemainBuat = await api("POST", "/api/creator/quizzes", cookiePemain, kuisValid);
  report(
    "pemain membuat kuis → 403",
    pemainBuat.status === 403 && pemainBuat.json?.error?.code === "FORBIDDEN",
    `status ${pemainBuat.status}`,
  );

  // ---------------------------------------------- daftar hanya milik sendiri
  const kuisBHapus = await api("POST", "/api/creator/quizzes", cookieB, {
    judul: "Kuis Milik Kreator B",
    durasi_detik: 300,
    kesulitan: "easy",
  });
  const kuisBId = kuisBHapus.json?.data?.id ?? null;
  report("kreator B bisa membuat kuis", kuisBHapus.status === 201 && Boolean(kuisBId));

  const daftarSeed = await api("GET", "/api/creator/quizzes", cookieSeed);
  const daftarB = await api("GET", "/api/creator/quizzes", cookieB);
  const idSeed = (daftarSeed.json?.data?.items ?? []).map((k) => k.id);
  const idB = (daftarB.json?.data?.items ?? []).map((k) => k.id);
  report(
    "daftar seed memuat kuis miliknya sendiri",
    idSeed.includes(kuisUtamaId),
    `${idSeed.length} kuis`,
  );
  report(
    "daftar seed TIDAK memuat kuis kreator B",
    kuisBId ? !idSeed.includes(kuisBId) : false,
    `B: ${kuisBId}`,
  );
  report(
    "daftar kreator B hanya miliknya",
    kuisBId ? idB.includes(kuisBId) && !idB.includes(kuisUtamaId) : false,
    `${idB.length} kuis`,
  );

  // ---------------------------------------------- PATCH metadata
  const kuisEditBuat = await api("POST", "/api/creator/quizzes", cookieSeed, {
    judul: "Kuis Sebelum Edit",
    deskripsi: "Deskripsi awal.",
    durasi_detik: 300,
    kesulitan: "easy",
    acak_soal: true,
    maks_percobaan: 5,
  });
  const kuisEditId = kuisEditBuat.json?.data?.id ?? null;
  report("kuis untuk di-edit dibuat", Boolean(kuisEditId));

  const patchJudul = await api("PATCH", `/api/creator/quizzes/${kuisEditId}`, cookieSeed, {
    judul: "Kuis Sesudah Edit",
  });
  report(
    "PATCH judul sendiri → 200 + nilai berubah",
    patchJudul.status === 200 && patchJudul.json?.data?.judul === "Kuis Sesudah Edit",
    `status ${patchJudul.status}, judul ${patchJudul.json?.data?.judul}`,
  );
  report(
    "PATCH parsial tidak menimpa bidang lain",
    patchJudul.json?.data?.deskripsi === "Deskripsi awal." &&
      patchJudul.json?.data?.acak_soal === true &&
      patchJudul.json?.data?.maks_percobaan === 5 &&
      patchJudul.json?.data?.durasi_detik === 300,
    JSON.stringify({
      deskripsi: patchJudul.json?.data?.deskripsi,
      acak: patchJudul.json?.data?.acak_soal,
      maks: patchJudul.json?.data?.maks_percobaan,
    }),
  );

  const patchKosong = await api("PATCH", `/api/creator/quizzes/${kuisEditId}`, cookieSeed, {});
  report(
    "PATCH tanpa perubahan → 400",
    patchKosong.status === 400 && patchKosong.json?.error?.code === "VALIDATION_ERROR",
    `status ${patchKosong.status}`,
  );

  const patchKategori = await api("PATCH", `/api/creator/quizzes/${kuisEditId}`, cookieSeed, {
    kategori: "teknologi",
    maks_percobaan: null,
  });
  report(
    "PATCH kategori valid + hapus batas percobaan",
    patchKategori.status === 200 &&
      patchKategori.json?.data?.kategori?.slug === "teknologi" &&
      patchKategori.json?.data?.maks_percobaan === null,
    `kategori ${patchKategori.json?.data?.kategori?.slug}, maks ${patchKategori.json?.data?.maks_percobaan}`,
  );

  const patchTakValid = await api("PATCH", `/api/creator/quizzes/${kuisEditId}`, cookieSeed, {
    durasi_detik: 0,
  });
  report(
    "PATCH durasi 0 → 400",
    patchTakValid.status === 400 && patchTakValid.json?.error?.code === "VALIDATION_ERROR",
    `status ${patchTakValid.status}`,
  );

  const patchOrangLain = await api("PATCH", `/api/creator/quizzes/${kuisBId}`, cookieSeed, {
    judul: "Coba Ubah Kuis Orang",
  });
  report(
    "PATCH kuis orang lain → 404",
    patchOrangLain.status === 404 && patchOrangLain.json?.error?.code === "NOT_FOUND",
    `status ${patchOrangLain.status}`,
  );

  const patchUuidNgawur = await api("PATCH", "/api/creator/quizzes/bukan-uuid", cookieSeed, {
    judul: "Uji",
  });
  report("PATCH id bukan uuid → 404", patchUuidNgawur.status === 404, `status ${patchUuidNgawur.status}`);

  // ---------------------------------------------- DELETE
  const kuisHapusBuat = await api("POST", "/api/creator/quizzes", cookieSeed, {
    judul: "Kuis Akan Dihapus",
    durasi_detik: 120,
    kesulitan: "easy",
  });
  const kuisHapusId = kuisHapusBuat.json?.data?.id ?? null;
  report("kuis draf untuk dihapus dibuat", Boolean(kuisHapusId));

  const hapusDraf = await api("DELETE", `/api/creator/quizzes/${kuisHapusId}`, cookieSeed);
  const sisaHapus = kuisHapusId ? await kuisAda(kuisHapusId) : null;
  report(
    "DELETE draf sendiri → 200 + benar-benar hilang",
    hapusDraf.status === 200 &&
      hapusDraf.json?.data?.aksi === "dihapus" &&
      !sisaHapus,
    `aksi ${hapusDraf.json?.data?.aksi}, sisa ${sisaHapus ? "ada" : "tidak ada"}`,
  );

  const kuisTerbitBuat = await api("POST", "/api/creator/quizzes", cookieSeed, {
    judul: "Kuis Terbit Akan Ditangguhkan",
    durasi_detik: 240,
    kesulitan: "medium",
  });
  const kuisTerbitId = kuisTerbitBuat.json?.data?.id ?? null;
  if (kuisTerbitId) await terbitkan(kuisTerbitId);

  const hapusTerbit = await api("DELETE", `/api/creator/quizzes/${kuisTerbitId}`, cookieSeed);
  const sisaTerbit = kuisTerbitId ? await kuisAda(kuisTerbitId) : null;
  report(
    "DELETE kuis terbit → 200 + ditangguhkan (bukan dihapus)",
    hapusTerbit.status === 200 &&
      hapusTerbit.json?.data?.aksi === "ditangguhkan" &&
      sisaTerbit?.status === "suspended" &&
      sisaTerbit?.visibilitas === "private",
    `aksi ${hapusTerbit.json?.data?.aksi}, status ${sisaTerbit?.status}, visibilitas ${sisaTerbit?.visibilitas}`,
  );

  const hapusOrangLain = await api("DELETE", `/api/creator/quizzes/${kuisBId}`, cookieSeed);
  report("DELETE kuis orang lain → 404", hapusOrangLain.status === 404, `status ${hapusOrangLain.status}`);

  const hapusAnon = await api("DELETE", `/api/creator/quizzes/${kuisEditId}`, null);
  report("DELETE anon → 401", hapusAnon.status === 401, `status ${hapusAnon.status}`);

  // ---------------------------------------------- halaman dasbor
  const halamanDasbor = await fetch(`${BASE_URL}/dasbor`, { headers: { cookie: cookieSeed } });
  const htmlDasbor = await halamanDasbor.text();
  report(
    "halaman /dasbor memuat daftar milik sendiri",
    halamanDasbor.status === 200 &&
      htmlDasbor.includes("Kuis saya") &&
      htmlDasbor.includes("Kuis Sesudah Edit"),
    `status ${halamanDasbor.status}`,
  );

  const halamanBuat = await fetch(`${BASE_URL}/dasbor/kuis/baru`, { headers: { cookie: cookieSeed } });
  const htmlBuat = await halamanBuat.text();
  report(
    "halaman buat kuis memuat form",
    halamanBuat.status === 200 && htmlBuat.includes("Judul kuis") && htmlBuat.includes("Durasi (menit)"),
    `status ${halamanBuat.status}`,
  );

  const halamanEdit = await fetch(`${BASE_URL}/dasbor/kuis/${kuisEditId}/edit`, {
    headers: { cookie: cookieSeed },
  });
  report(
    "halaman edit kuis sendiri → 200",
    halamanEdit.status === 200 && (await halamanEdit.text()).includes("Edit kuis"),
    `status ${halamanEdit.status}`,
  );

  const halamanEditOrang = await fetch(`${BASE_URL}/dasbor/kuis/${kuisBId}/edit`, {
    headers: { cookie: cookieSeed },
  });
  report(
    "halaman edit kuis orang lain → 404",
    halamanEditOrang.status === 404,
    `status ${halamanEditOrang.status}`,
  );

  const halamanDasborAnon = await fetch(`${BASE_URL}/dasbor`, { redirect: "manual" });
  report(
    "/dasbor tanpa login dialihkan ke /masuk",
    (halamanDasborAnon.status === 307 || halamanDasborAnon.status === 302) &&
      (halamanDasborAnon.headers.get("location") ?? "").includes("/masuk"),
    `status ${halamanDasborAnon.status}, lokasi ${halamanDasborAnon.headers.get("location")}`,
  );

  // ---------------------------------------------- bersih-bersih
  for (const id of [kuisUtamaId, kuisEditId, kuisTerbitId, kuisHapusId, kuisBId]) {
    if (!id) continue;
    await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${id}`, {
      method: "DELETE",
      headers: serviceHeaders,
    });
  }
  await hapusPengguna(idPemain);
  await hapusPengguna(idKreatorB);
  console.log("Bersih-bersih selesai.");
} catch (error) {
  report("eksekusi e2e creator", false, error instanceof Error ? error.message : String(error));
}

const gagal = results.filter((r) => !r.ok);
console.log(`\nRingkasan: ${results.length - gagal.length}/${results.length} pemeriksaan lolos.`);
if (gagal.length > 0) {
  console.error("GAGAL:", gagal.map((g) => g.name).join(", "));
  process.exit(1);
}
console.log("E2E creator LULUS.");