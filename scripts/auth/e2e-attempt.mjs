#!/usr/bin/env node
/**
 * E2E percobaan kuis — Gate F7:
 *   - mulai percobaan (201) dengan started_at/expires_at/acak dari server
 *   - dua request "mulai" bersarang → tetap SATU attempt aktif (idempoten)
 *   - GET state: sisa_detik konsisten dengan expires_at − server_now
 *   - maks_percobaan ditegakkan (409 MAX_ATTEMPTS_REACHED)
 *   - default attempt kosong (belum ada jawaban) — autosave datang F8
 *   - attempt milik pengguna lain → 404
 *
 * Jalankan dev server (npm run dev) dan seed (npm run db:seed) lebih dulu:
 *   node scripts/auth/e2e-attempt.mjs
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

function createJar() {
  const cookies = new Map();
  return {
    absorb(res) {
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(";");
        const idx = pair.indexOf("=");
        if (idx > 0) cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

const serviceHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
};

async function api(jar, path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(jar ? { cookie: jar.header() } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (jar) jar.absorb(res);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function cariKuis(judul) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/quizzes?select=id&judul=eq.${encodeURIComponent(judul)}`,
    { headers: serviceHeaders },
  );
  const rows = await res.json();
  return rows?.[0]?.id ?? null;
}

async function buatUserDanLogin(password) {
  const email = `attempt-${Date.now().toString(36)}@example.com`;
  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await created.json();

  const jar = createJar();
  const login = await api(jar, "/api/auth/masuk", { method: "POST", body: { email, password } });
  return { userId: user.id, email, jar, loginStatus: login.status };
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const usersToDelete = [];
const quizzesToDelete = [];

try {
  const kuisId = await cariKuis("Kuis Pengetahuan Umum Indonesia");
  report("kuis seed terbit tersedia", Boolean(kuisId), String(kuisId));
  if (!kuisId) throw new Error("jalankan 'npm run db:seed' lebih dulu");

  // ---------------------------------------------- user A & user B
  const userA = await buatUserDanLogin("rahasia-uji-123");
  const userB = await buatUserDanLogin("rahasia-uji-123");
  usersToDelete.push(userA.userId, userB.userId);
  report("pengguna uji A & B dibuat + login", userA.loginStatus === 200 && userB.loginStatus === 200);

  // ---------------------------------------------- mulai percobaan
  const mulai1 = await api(userA.jar, "/api/attempts", { method: "POST", body: { quiz_id: kuisId } });
  const attemptId = mulai1.json?.data?.attempt?.id;
  const expiresAt = mulai1.json?.data?.attempt?.expires_at;
  const acak = mulai1.json?.data?.acak ?? {};
  report(
    "mulai percobaan → 201 + attempt dari server",
    mulai1.status === 201 && Boolean(attemptId) && Boolean(expiresAt),
    `status ${mulai1.status}${mulai1.status !== 201 ? `, ${JSON.stringify(mulai1.json?.error ?? {})}` : ""}`,
  );

  if (!attemptId) throw new Error("percobaan gagal dibuat");

  const sisaServer = mulai1.json?.data?.sisa_detik;
  report(
    "acak snapshot berisi 8 soal + opsi",
    Array.isArray(acak.soal) && acak.soal.length === 8 && Object.keys(acak.opsi ?? {}).length === 8,
    `soal: ${acak.soal?.length}, opsi: ${Object.keys(acak.opsi ?? {}).length}, sisa: ${sisaServer}s`,
  );

  // ---------------------------------------------- idempoten (2x mulai)
  const mulai2 = await api(userA.jar, "/api/attempts", { method: "POST", body: { quiz_id: kuisId } });
  report(
    "request 'mulai' kedua → 200, attempt yang SAMA",
    mulai2.status === 200 && mulai2.json?.data?.attempt?.id === attemptId,
    `status ${mulai2.status}, id sama: ${mulai2.json?.data?.attempt?.id === attemptId}`,
  );

  await client.connect();
  const countAktif = await client.query(
    "select count(*)::int as n from public.attempts where quiz_id = $1 and user_id = $2 and status = 'in_progress'",
    [kuisId, userA.userId],
  );
  report(
    "2 request 'mulai' → tetap 1 attempt aktif di DB",
    countAktif.rows[0].n === 1,
    `jumlah: ${countAktif.rows[0].n}`,
  );

  // ---------------------------------------------- GET state
  const state = await api(userA.jar, `/api/attempts/${attemptId}`);
  const stateData = state.json?.data ?? {};
  const attemptState = stateData.attempt ?? {};
  const serverNow = new Date(stateData.server_now).getTime();
  const expires = new Date(attemptState.expires_at).getTime();
  const sisaHitung = Math.floor((expires - serverNow) / 1000);
  report(
    "GET state: sisa_detik konsisten dengan expires_at − server_now",
    state.status === 200 &&
      typeof stateData.sisa_detik === "number" &&
      Math.abs(stateData.sisa_detik - sisaHitung) <= 2,
    `sisa_detik: ${stateData.sisa_detik}, hitung: ${sisaHitung}`,
  );

  report(
    "attempt default kosong (autosave hadir di F8)",
    stateData.sudah_dijawab === 0 && stateData.total_soal === 8,
    `sudah_dijawab: ${stateData.sudah_dijawab}, total_soal: ${stateData.total_soal}`,
  );

  // ---------------------------------------------- attempt orang lain → 404
  const stateB = await api(userB.jar, `/api/attempts/${attemptId}`);
  report(
    "attempt milik pengguna lain → 404 ATTEMPT_NOT_FOUND",
    stateB.status === 404 && stateB.json?.error?.code === "ATTEMPT_NOT_FOUND",
    `status ${stateB.status}`,
  );

  // ---------------------------------------------- mulai tanpa login → 401
  const tanpaSesi = await api(null, "/api/attempts", { method: "POST", body: { quiz_id: kuisId } });
  report(
    "mulai percobaan tanpa login → 401",
    tanpaSesi.status === 401 && tanpaSesi.json?.error?.code === "UNAUTHORIZED",
    `status ${tanpaSesi.status}`,
  );

  // ---------------------------------------------- maks_percobaan
  const kuisBatas = await client.query(
    `insert into public.quizzes (owner_id, judul, deskripsi, category_id, kesulitan, durasi_detik, status, visibilitas, maks_percobaan)
     select p.id, 'Kuis Uji Batas Percobaan', 'kuis sementara untuk uji batas', null, 'easy', 300, 'published', 'public', 1
     from public.profiles p where p.role in ('creator','admin') order by p.created_at limit 1
     returning id`,
  );
  const kuisBatasId = kuisBatas.rows[0]?.id;
  quizzesToDelete.push(kuisBatasId);
  await client.query(
    `insert into public.questions (quiz_id, teks, tipe, bobot, urutan, pembahasan)
     values ($1, 'Soal batas percobaan', 'single', 1, 0, 'uji')`,
    [kuisBatasId],
  );

  const userC = await buatUserDanLogin("rahasia-uji-123");
  usersToDelete.push(userC.userId);

  const mulaiC1 = await api(userC.jar, "/api/attempts", { method: "POST", body: { quiz_id: kuisBatasId } });
  report("kuis batas: percobaan pertama → 201", mulaiC1.status === 201, `status ${mulaiC1.status}`);

  // Tandai selesai (simulasi percobaan tuntas) lewat admin SQL, lalu mulai lagi.
  // Cukup ubah status: expires_at dibiarkan agar constraint tetap sah.
  await client.query(
    `update public.attempts set status = 'expired'
     where quiz_id = $1 and user_id = $2 and status = 'in_progress'`,
    [kuisBatasId, userC.userId],
  );

  const mulaiC2 = await api(userC.jar, "/api/attempts", { method: "POST", body: { quiz_id: kuisBatasId } });
  report(
    "kuis batas: percobaan kedua → 409 MAX_ATTEMPTS_REACHED",
    mulaiC2.status === 409 && mulaiC2.json?.error?.code === "MAX_ATTEMPTS_REACHED",
    `status ${mulaiC2.status}, ${mulaiC2.json?.error?.code ?? ""}`,
  );

  // ---------------------------------------------- kuis draf tidak bisa dikerjakan
  const drafId = await cariKuis("Kuis Draf — Uji Privat");
  const mulaiDraf = await api(userA.jar, "/api/attempts", { method: "POST", body: { quiz_id: drafId } });
  report(
    "mulai percobaan pada kuis draf → 409 QUIZ_NOT_PUBLISHED",
    mulaiDraf.status === 409 && mulaiDraf.json?.error?.code === "QUIZ_NOT_PUBLISHED",
    `status ${mulaiDraf.status}, ${mulaiDraf.json?.error?.code ?? ""}`,
  );
} catch (error) {
  report("eksekusi e2e attempt", false, error instanceof Error ? error.message : String(error));
} finally {
  for (const quizId of quizzesToDelete) {
    if (!quizId) continue;
    await client.query("delete from public.quizzes where id = $1", [quizId]).catch(() => undefined);
  }
  for (const userId of usersToDelete) {
    if (!userId) continue;
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: serviceHeaders,
    }).catch(() => undefined);
  }
  await client.end().catch(() => undefined);
  if (usersToDelete.length) console.log(`Pengguna & kuis uji dihapus (${usersToDelete.length} user, ${quizzesToDelete.length} kuis).`);
}

const gagal = results.filter((r) => !r.ok);
console.log(`\nRingkasan: ${results.length - gagal.length}/${results.length} pemeriksaan lolos.`);
if (gagal.length > 0) {
  console.error("GAGAL:", gagal.map((g) => g.name).join(", "));
  process.exit(1);
}
console.log("E2E attempt LULUS.");
