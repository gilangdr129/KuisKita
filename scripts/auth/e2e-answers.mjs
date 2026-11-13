#!/usr/bin/env node
/**
 * E2E autosave jawaban — Gate F8:
 *   - PUT answers menyimpan satu jawaban per soal (upsert)
 *   - opsi dari soal lain → 400 OPTION_MISMATCH (anti-tamper)
 *   - refresh (GET state) mengembalikan jawaban tersimpan (server menang)
 *   - 2 tab: jawaban tab-1 terlihat di tab-2 (last-write-wins soal sama)
 *   - jawaban setelah expiry → 409 ATTEMPT_EXPIRED
 *   - attempt milik orang lain → 404
 *
 * Jalankan dev server (npm run dev) dan seed (npm run db:seed) lebih dulu:
 *   node scripts/auth/e2e-answers.mjs
 *
 * Catatan: perilaku antre offline + retry backoff adalah logika klien (browser)
 * yang diuji manual (toggle offline di DevTools); uji otomatis di sini fokus
 * ke sisi server.
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

async function buatUserDanLogin() {
  const email = `autosave-${Date.now().toString(36)}@example.com`;
  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({ email, password: "rahasia-uji-123", email_confirm: true }),
  });
  const user = await created.json();
  const jar = createJar();
  const login = await api(jar, "/api/auth/masuk", {
    method: "POST",
    body: { email, password: "rahasia-uji-123" },
  });
  return { userId: user.id, jar, loginStatus: login.status };
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const usersToDelete = [];

try {
  const kuisRes = await fetch(
    `${SUPABASE_URL}/rest/v1/quizzes?select=id&judul=eq.${encodeURIComponent("Kuis Pengetahuan Umum Indonesia")}`,
    { headers: serviceHeaders },
  );
  const kuisId = (await kuisRes.json())?.[0]?.id;
  report("kuis seed terbit tersedia", Boolean(kuisId), String(kuisId));
  if (!kuisId) throw new Error("jalankan 'npm run db:seed' lebih dulu");

  const soalRes = await fetch(
    `${SUPABASE_URL}/rest/v1/questions?select=id,options(id,teks)&quiz_id=eq.${kuisId}&order=urutan`,
    { headers: { apikey: ANON_KEY } },
  );
  const soalList = await soalRes.json();
  const q1 = soalList[0];
  const q2 = soalList[1];
  report("soal seed dapat dibaca anon", soalList.length === 8, `${soalList.length} soal`);

  const user = await buatUserDanLogin();
  usersToDelete.push(user.userId);
  report("pengguna uji dibuat + login", user.loginStatus === 200);

  const mulai = await api(user.jar, "/api/attempts", { method: "POST", body: { quiz_id: kuisId } });
  const attemptId = mulai.json?.data?.attempt?.id;
  report("mulai percobaan", mulai.status === 201 && Boolean(attemptId), `status ${mulai.status}`);
  if (!attemptId) throw new Error("percobaan gagal");

  // ------------------------------------------------ simpan jawaban pertama
  const simpan1 = await api(user.jar, `/api/attempts/${attemptId}/answers`, {
    method: "PUT",
    body: { pertanyaan_id: q1.id, opsi_id: q1.options[0].id },
  });
  report(
    "PUT answer pertama → 200 tersimpan",
    simpan1.status === 200 && simpan1.json?.data?.tersimpan === true,
    `sudah_dijawab: ${simpan1.json?.data?.sudah_dijawab}`,
  );

  // ------------------------------------------------ upsert (ganti jawaban)
  const simpan1b = await api(user.jar, `/api/attempts/${attemptId}/answers`, {
    method: "PUT",
    body: { pertanyaan_id: q1.id, opsi_id: q1.options[1].id },
  });
  report(
    "ganti jawaban soal sama → upsert (tetap 1 jawaban)",
    simpan1b.status === 200 && simpan1b.json?.data?.sudah_dijawab === 1,
    `sudah_dijawab: ${simpan1b.json?.data?.sudah_dijawab}`,
  );

  // ------------------------------------------------ opsi dari soal lain
  const salahOpsi = await api(user.jar, `/api/attempts/${attemptId}/answers`, {
    method: "PUT",
    body: { pertanyaan_id: q2.id, opsi_id: q1.options[0].id },
  });
  report(
    "opsi milik soal lain → 400 OPTION_MISMATCH",
    salahOpsi.status === 400 && salahOpsi.json?.error?.code === "OPTION_MISMATCH",
    `status ${salahOpsi.status}, ${salahOpsi.json?.error?.code ?? ""}`,
  );

  // ------------------------------------------------ refresh: server menang
  const state = await api(user.jar, `/api/attempts/${attemptId}`);
  const jawaban = state.json?.data?.jawaban ?? [];
  const jawabanQ1 = jawaban.find((j) => j.pertanyaan_id === q1.id);
  report(
    "refresh: jawaban terbaru dari server (last-write-wins)",
    state.status === 200 && jawabanQ1?.opsi_id === q1.options[1].id,
    `opsi tersimpan: ${jawabanQ1?.opsi_id}`,
  );

  // ------------------------------------------------ 2 tab (user sama)
  const stateTab2 = await api(user.jar, `/api/attempts/${attemptId}`);
  const jawabanTab2 = (stateTab2.json?.data?.jawaban ?? []).find((j) => j.pertanyaan_id === q1.id);
  report(
    "tab kedua membaca jawaban yang sama dari server",
    jawabanTab2?.opsi_id === q1.options[1].id,
    `opsi: ${jawabanTab2?.opsi_id}`,
  );

  // ------------------------------------------------ soal kedua
  const simpan2 = await api(user.jar, `/api/attempts/${attemptId}/answers`, {
    method: "PUT",
    body: { pertanyaan_id: q2.id, opsi_id: q2.options[0].id },
  });
  report(
    "soal kedua tersimpan",
    simpan2.status === 200 && simpan2.json?.data?.sudah_dijawab === 2,
    `sudah_dijawab: ${simpan2.json?.data?.sudah_dijawab}`,
  );

  // ------------------------------------------------ attempt orang lain → 404
  const userB = await buatUserDanLogin();
  usersToDelete.push(userB.userId);
  const dariB = await api(userB.jar, `/api/attempts/${attemptId}/answers`, {
    method: "PUT",
    body: { pertanyaan_id: q1.id, opsi_id: q1.options[0].id },
  });
  report(
    "simpan jawaban pada attempt orang lain → 404",
    dariB.status === 404 && dariB.json?.error?.code === "ATTEMPT_NOT_FOUND",
    `status ${dariB.status}`,
  );

  // ------------------------------------------------ setelah expiry → 409
  await client.connect();
  await client.query(
    `update public.attempts set expires_at = now() - interval '1 second'
     where id = $1 and status = 'in_progress'`,
    [attemptId],
  );
  const setelahHabis = await api(user.jar, `/api/attempts/${attemptId}/answers`, {
    method: "PUT",
    body: { pertanyaan_id: q2.id, opsi_id: q2.options[1].id },
  });
  report(
    "jawaban setelah waktu habis → 409 ATTEMPT_EXPIRED",
    setelahHabis.status === 409 && setelahHabis.json?.error?.code === "ATTEMPT_EXPIRED",
    `status ${setelahHabis.status}, ${setelahHabis.json?.error?.code ?? ""}`,
  );

  await client.query("delete from public.attempts where id = $1", [attemptId]);
} catch (error) {
  report("eksekusi e2e answers", false, error instanceof Error ? error.message : String(error));
} finally {
  for (const userId of usersToDelete) {
    if (!userId) continue;
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: serviceHeaders,
    }).catch(() => undefined);
  }
  await client.end().catch(() => undefined);
  if (usersToDelete.length) console.log(`Pengguna uji dihapus (${usersToDelete.length}).`);
}

const gagal = results.filter((r) => !r.ok);
console.log(`\nRingkasan: ${results.length - gagal.length}/${results.length} pemeriksaan lolos.`);
if (gagal.length > 0) {
  console.error("GAGAL:", gagal.map((g) => g.name).join(", "));
  process.exit(1);
}
console.log("E2E answers LULUS.");
