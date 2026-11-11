#!/usr/bin/env node
/**
 * E2E detail kuis (Gate F6):
 *   - halaman detail menampilkan soal & opsi TANPA membocorkan kunci jawaban
 *   - kuis draf 404 untuk anon (RLS), 200 untuk pemilik
 *   - question_keys tertutup untuk klien anon
 *
 * Jalankan dev server (npm run dev) dan seed (npm run db:seed) lebih dulu:
 *   node scripts/auth/e2e-detail.mjs
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
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
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

/** Ambil id kuis lewat service role (RLS dilewati sebagai admin). */
async function cariKuisId(judul) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/quizzes?select=id&judul=eq.${encodeURIComponent(judul)}`,
    { headers: serviceHeaders },
  );
  const rows = await res.json();
  return rows?.[0]?.id ?? null;
}

try {
  const kuisId = await cariKuisId("Kuis Pengetahuan Umum Indonesia");
  const drafId = await cariKuisId("Kuis Draf — Uji Privat");

  report("seed kuis terbit ditemukan", Boolean(kuisId), String(kuisId));
  report("seed kuis draf ditemukan", Boolean(drafId), String(drafId));
  if (!kuisId || !drafId) throw new Error("jalankan 'npm run db:seed' lebih dulu");

  // ---------------------------------------------- detail publik tanpa kunci
  const anonHtmlRes = await fetch(`${BASE_URL}/kuis/${kuisId}`);
  const anonHtml = await anonHtmlRes.text();
  report(
    "halaman detail publik dapat dilihat anon (200)",
    anonHtmlRes.status === 200,
    `status ${anonHtmlRes.status}`,
  );

  const anonHtmlLower = anonHtml.toLowerCase();
  const adaSoal = ["Puncak Jaya Wijaya", "Cenderawasih", "Candi Borobudur"].filter((teks) =>
    anonHtmlLower.includes(teks.toLowerCase()),
  );
  report(
    "teks soal tampil di halaman",
    adaSoal.length === 3,
    `${adaSoal.length}/3 teks ditemukan`,
  );

  const bocor = ["question_keys", '"benar"', "benar: true", "is_correct", "kunci jawaban"].filter(
    (penanda) => anonHtml.includes(penanda),
  );
  report(
    "tidak ada penanda kunci jawaban di HTML",
    bocor.length === 0,
    bocor.length ? `bocor: ${bocor.join(", ")}` : "bersih",
  );

  // ---------------------------------------------- draf 404 untuk anon
  const drafAnonRes = await fetch(`${BASE_URL}/kuis/${drafId}`);
  report(
    "kuis draf 404 untuk pengunjung (anon)",
    drafAnonRes.status === 404,
    `status ${drafAnonRes.status}`,
  );

  // ---------------------------------------------- draf 200 untuk pemilik
  const loginRes = await fetch(`${BASE_URL}/api/auth/masuk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: SEED_EMAIL, password: SEED_PASSWORD }),
  });
  const cookie = loginRes.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  report("pemilik (kreator seed) bisa masuk", loginRes.status === 200, `status ${loginRes.status}`);

  const drafOwnerRes = await fetch(`${BASE_URL}/kuis/${drafId}`, {
    headers: { cookie },
  });
  report(
    "kuis draf 200 untuk pemiliknya",
    drafOwnerRes.status === 200,
    `status ${drafOwnerRes.status}`,
  );

  // ---------------------------------------------- question_keys tertutup
  const keysRes = await fetch(`${SUPABASE_URL}/rest/v1/question_keys?select=*`, {
    headers: { apikey: ANON_KEY },
  });
  report(
    "question_keys tertutup untuk klien anon (401/403)",
    keysRes.status === 401 || keysRes.status === 403,
    `status ${keysRes.status}`,
  );

  // ---------------------------------------------- detail API tidak ada kunci
  const soalRes = await fetch(
    `${SUPABASE_URL}/rest/v1/questions?select=id,teks,options(id,teks,urutan)&quiz_id=eq.${kuisId}`,
    { headers: { apikey: ANON_KEY } },
  );
  const soalJson = await soalRes.json();
  const teksBersih = !JSON.stringify(soalJson ?? {}).includes("question_keys");
  report(
    "kueri questions+options via anon tidak memuat kunci",
    soalRes.status === 200 && teksBersih,
    `status ${soalRes.status}, ${Array.isArray(soalJson) ? soalJson.length : 0} soal`,
  );
} catch (error) {
  report("eksekusi e2e detail", false, error instanceof Error ? error.message : String(error));
}

const gagal = results.filter((r) => !r.ok);
console.log(`\nRingkasan: ${results.length - gagal.length}/${results.length} pemeriksaan lolos.`);
if (gagal.length > 0) {
  console.error("GAGAL:", gagal.map((g) => g.name).join(", "));
  process.exit(1);
}
console.log("E2E detail LULUS.");
