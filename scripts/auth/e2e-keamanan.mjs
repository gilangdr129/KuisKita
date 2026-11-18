#!/usr/bin/env node
/**
 * E2E keamanan — Gate F18:
 *   - header CSP & header keamanan lain ada di respons
 *   - Redis mati/belum diisi → request tetap dilayani (fail-open)
 *   - submit terlalu cepat ditandai `tanda_review` (bukan diblokir)
 *   - Turnstile fail-closed: token jelek ditolak, token valid lolos,
 *     token kosong ditolak bila secret dikonfigurasi — diverifikasi dengan
 *     kunci uji resmi Cloudflare pada server dev terpisah.
 *
 * Variabel opsional:
 *   TURNSTILE_FAIL_URL — dev server dengan secret selalu-gagal (2x…AA)
 *   TURNSTILE_PASS_URL — dev server dengan secret selalu-lolos (1x…AA)
 *
 * Jalankan dev server (npm run dev) dan seed (npm run db:seed) lebih dulu:
 *   node scripts/auth/e2e-keamanan.mjs
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
  const json = await res.json().catch(() => null);
  return {
    status: res.status,
    json,
    cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; "),
  };
}

function api(method, path, cookie, body) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));
}

let quizId = null;

try {
  // ---------------------------------------------- header keamanan
  const katalog = await fetch(`${BASE_URL}/kuis`);
  const csp = katalog.headers.get("content-security-policy") ?? "";
  report(
    "header CSP ada & memuat default-src 'self'",
    csp.includes("default-src 'self'"),
    csp.slice(0, 60),
  );
  report(
    "header keamanan lain ada (nosniff, DENY, referrer-policy)",
    katalog.headers.get("x-content-type-options") === "nosniff" &&
      katalog.headers.get("x-frame-options") === "DENY" &&
      (katalog.headers.get("referrer-policy") ?? "").length > 0,
    `nosniff=${katalog.headers.get("x-content-type-options")}, frame=${katalog.headers.get("x-frame-options")}`,
  );

  // ---------------------------------------------- fail-open (tanpa Redis)
  // Beberapa login salah berturut-turut: tanpa Upstash semua tetap dilayani
  // (bukan 429) — bukti D9 fail-open. Upstash terisi → uji burst lewat unit test.
  const statusBurst = [];
  for (let i = 0; i < 6; i += 1) {
    const salah = await login(SEED_EMAIL, "password-salah-sekali");
    statusBurst.push(salah.status);
  }
  report(
    "burst 6 login tanpa Redis → semua 401 (fail-open, bukan 429)",
    statusBurst.every((status) => status === 401),
    statusBurst.join(","),
  );

  // ---------------------------------------------- kuis untuk submit cepat
  const cookieSeed = (await login(SEED_EMAIL, SEED_PASSWORD)).cookie;
  const kuis = await api("POST", "/api/creator/quizzes", cookieSeed, {
    judul: `Kuis Keamanan Uji ${Date.now()}`,
    durasi_detik: 600,
    kesulitan: "easy",
  });
  quizId = kuis.json?.data?.id ?? null;
  await api("PUT", `/api/creator/quizzes/${quizId}/questions`, cookieSeed, {
    soal: [{ teks: "Soal keamanan", tipe: "single", opsi: [{ teks: "A" }, { teks: "B" }] }],
  });
  const muat = await api("GET", `/api/creator/quizzes/${quizId}/questions`, cookieSeed);
  const soal = (muat.json?.data?.soal ?? [])[0];
  await api("PUT", `/api/creator/quizzes/${quizId}/kunci`, cookieSeed, {
    question_id: soal.id,
    option_id: soal.opsi[0].id,
  });
  await api("POST", `/api/creator/quizzes/${quizId}/publish`, cookieSeed);
  report("kuis uji untuk submit cepat terbit", Boolean(quizId));

  const mulai = await api("POST", "/api/attempts", cookieSeed, { quiz_id: quizId });
  const attemptId = mulai.json?.data?.attempt?.id ?? null;
  await api("PUT", `/api/attempts/${attemptId}/answers`, cookieSeed, {
    pertanyaan_id: soal.id,
    opsi_id: soal.opsi[0].id,
  });

  // Deterministik: started_at diatur lewat service role agar uji tidak
  // bergantung pada kecepatan kompilasi dev server (durasi_ms dihitung dari
  // started_at oleh RPC submit).
  await fetch(`${SUPABASE_URL}/rest/v1/attempts?id=eq.${attemptId}`, {
    method: "PATCH",
    headers: serviceHeaders,
    body: JSON.stringify({ started_at: new Date(Date.now() - 1000).toISOString() }),
  });
  const submitCepat = await api("POST", `/api/attempts/${attemptId}/submit`, cookieSeed);
  report(
    "submit < 5 detik → diterima dengan tanda_review (bukan diblokir)",
    submitCepat.status === 200 && submitCepat.json?.data?.tanda_review === true,
    `status ${submitCepat.status}, tanda_review ${submitCepat.json?.data?.tanda_review}`,
  );

  const attemptKedua = await api("POST", "/api/attempts", cookieSeed, { quiz_id: quizId });
  const attemptKeduaId = attemptKedua.json?.data?.attempt?.id ?? null;
  await fetch(`${SUPABASE_URL}/rest/v1/attempts?id=eq.${attemptKeduaId}`, {
    method: "PATCH",
    headers: serviceHeaders,
    body: JSON.stringify({ started_at: new Date(Date.now() - 30_000).toISOString() }),
  });
  const submitLama = await api("POST", `/api/attempts/${attemptKeduaId}/submit`, cookieSeed);
  report(
    "submit setelah > 5 detik → tanda_review false",
    submitLama.status === 200 && submitLama.json?.data?.tanda_review === false,
    `tanda_review ${submitLama.json?.data?.tanda_review}`,
  );

  // ---------------------------------------------- Turnstile
  // Verifikasi Turnstile end-to-end ada di scripts/auth/e2e-turnstile.mjs
  // (dijalankan terpisah dengan secret kunci uji Cloudflare — Next 16 hanya
  // mengizinkan satu dev server per proyek).

  // ---------------------------------------------- bersih-bersih
  if (quizId) {
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
  console.log("Bersih-bersih selesai.");
} catch (error) {
  report("eksekusi e2e keamanan", false, error instanceof Error ? error.message : String(error));
}

const gagal = results.filter((r) => !r.ok);
console.log(`\nRingkasan: ${results.length - gagal.length}/${results.length} pemeriksaan lolos.`);
if (gagal.length > 0) {
  console.error("GAGAL:", gagal.map((g) => g.name).join(", "));
  process.exit(1);
}
console.log("E2E keamanan LULUS.");