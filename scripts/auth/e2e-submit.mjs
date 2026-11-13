#!/usr/bin/env node
/**
 * E2E penilaian — Gate F9:
 *   - submit → hasil benar (benar/salah per soal, skor berbobot, persentase)
 *   - submit setelah expires_at → 409 ATTEMPT_EXPIRED, nilai dari autosave,
 *     status expired
 *   - submit ganda → hasil pertama (idempoten)
 *   - attempt B tak bisa dilihat A (RLS/RPC)
 *   - RPC percobaan TIDAK bisa dipanggil klien langsung (EXECUTE dicabut)
 *   - kuis durasi pendek dari seed untuk menguji expiry
 *
 * Jalankan dev server (npm run dev) dan seed (npm run db:seed) lebih dulu:
 *   node scripts/auth/e2e-submit.mjs
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
  const email = `submit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@example.com`;
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
  return { userId: user.id, email, jar, loginStatus: login.status };
}

async function dapatkanKunci(quizId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/questions?select=id,options(id)&quiz_id=eq.${quizId}&order=urutan`,
    { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } },
  );
  const soal = await res.json();
  const keys = await fetch(
    `${SUPABASE_URL}/rest/v1/question_keys?select=question_id,option_id`,
    { headers: serviceHeaders },
  );
  const kunci = await keys.json();
  const kunciPerSoal = new Map(kunci.map((k) => [k.question_id, k.option_id]));
  return soal.map((s) => ({
    id: s.id,
    benar: kunciPerSoal.get(s.id) ?? s.options[0].id,
    opsi: s.options.map((o) => o.id),
  }));
}

const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const usersToDelete = [];
const quizzesToDelete = [];

try {
  await client.connect();

  // ------------------------------------------------ kuis utama (8 soal)
  const kuisRes = await fetch(
    `${SUPABASE_URL}/rest/v1/quizzes?select=id&judul=eq.${encodeURIComponent("Kuis Pengetahuan Umum Indonesia")}`,
    { headers: serviceHeaders },
  );
  const kuisId = (await kuisRes.json())?.[0]?.id;
  if (!kuisId) throw new Error("jalankan 'npm run db:seed' lebih dulu");
  const SoalKunci = await dapatkanKunci(kuisId);
  report("kuis seed + kunci siap dipakai pembanding", SoalKunci.length === 8, `${SoalKunci.length} soal`);

  const user = await buatUserDanLogin();
  usersToDelete.push(user.userId);
  report("pengguna uji dibuat + login", user.loginStatus === 200);

  const mulai = await api(user.jar, "/api/attempts", { method: "POST", body: { quiz_id: kuisId } });
  const attemptId = mulai.json?.data?.attempt?.id;
  if (!attemptId) throw new Error("percobaan gagal dibuat");

  // Jawab: 5 benar, 3 salah (skor harapan = bobot soal benar)
  for (const [index, soal] of SoalKunci.entries()) {
    const pilihBenar = index < 5;
    const opsi = pilihBenar ? soal.benar : soal.opsi.find((o) => o !== soal.benar) ?? soal.opsi[0];
    const simpan = await api(user.jar, `/api/attempts/${attemptId}/answers`, {
      method: "PUT",
      body: { pertanyaan_id: soal.id, opsi_id: opsi },
    });
    if (simpan.status !== 200) throw new Error(`gagal menyimpan jawaban ${index}: ${simpan.status}`);
  }
  report("5 jawaban benar + 3 salah tersimpan", true, "8/8 jawaban terkirim");

  // ------------------------------------------------ submit → hasil
  const submit = await api(user.jar, `/api/attempts/${attemptId}/submit`, { method: "POST" });

  // Hitung nilai harapan langsung dari DB (pembanding independen dari RPC).
  const bobot = await client
    .query(
      `select coalesce(sum(q.bobot), 0) as skor, count(*)::int as benar
         from public.attempt_answers aa
         join public.questions q on q.id = aa.question_id
         join public.question_keys qk on qk.question_id = aa.question_id and qk.option_id = aa.option_id
        where aa.attempt_id = $1`,
      [attemptId],
    )
    .then(async (r) => {
      const total = await client.query(
        `select coalesce(sum(q.bobot), 0) as total from public.questions q where q.quiz_id = $1`,
        [kuisId],
      );
      return {
        skor: Number(r.rows[0].skor),
        benar: r.rows[0].benar,
        total: Number(total.rows[0].total),
      };
    });

  const submitData = submit.json?.data ?? {};
  const persenHarapan = Math.round((bobot.skor / bobot.total) * 10000) / 100;
  report(
    "submit → skor berbobot & persentase benar",
    submit.status === 200 &&
      Number(submitData.skor) === bobot.skor &&
      Number(submitData.persentase) === persenHarapan &&
      submitData.benar === 5 &&
      submitData.salah === 3,
    `skor ${submitData.skor}/${bobot.total} (harap ${bobot.skor}), ${submitData.persentase}% (harap ${persenHarapan}%), benar ${submitData.benar}, salah ${submitData.salah}`,
  );

  // ------------------------------------------------ hasil + pembahasan
  const result = await api(user.jar, `/api/attempts/${attemptId}/result`);
  const soalHasil = result.json?.data?.soal ?? [];
  const adaPembahasan = soalHasil.filter((s) => (s.pembahasan ?? "") !== "").length;
  const benarTandai = soalHasil.filter((s) => s.benar === true).length;
  const tidakAdaKunciMentah = !JSON.stringify(result.json ?? {}).includes("question_keys");
  report(
    "halaman hasil: per-soal benar/salah + pembahasan, tanpa kunci mentah",
    result.status === 200 &&
      soalHasil.length === 8 &&
      adaPembahasan === 8 &&
      benarTandai === 5 &&
      tidakAdaKunciMentah,
    `${soalHasil.length} soal, ${benarTandai} benar, ${adaPembahasan} pembahasan`,
  );

  // ------------------------------------------------ submit ganda (idempoten)
  const submit2 = await api(user.jar, `/api/attempts/${attemptId}/submit`, { method: "POST" });
  report(
    "submit ganda → hasil pertama (sudah_final)",
    submit2.status === 200 &&
      submit2.json?.data?.sudah_final === true &&
      Number(submit2.json?.data?.skor) === Number(submitData.skor),
    `status ${submit2.status}, sudah_final: ${submit2.json?.data?.sudah_final}`,
  );

  // ------------------------------------------------ result sebelum submit → 403
  const user2 = await buatUserDanLogin();
  usersToDelete.push(user2.userId);
  const mulai2 = await api(user2.jar, "/api/attempts", { method: "POST", body: { quiz_id: kuisId } });
  const attempt2 = mulai2.json?.data?.attempt?.id;
  const resultAwal = await api(user2.jar, `/api/attempts/${attempt2}/result`);
  report(
    "hasil sebelum submit → 403 ATTEMPT_NOT_SUBMITTED",
    resultAwal.status === 403 && resultAwal.json?.error?.code === "ATTEMPT_NOT_SUBMITTED",
    `status ${resultAwal.status}, ${resultAwal.json?.error?.code ?? ""}`,
  );

  // ------------------------------------------------ attempt B tak terbaca A
  const dariA = await api(user.jar, `/api/attempts/${attempt2}/result`);
  report(
    "percobaan milik pengguna lain → 404",
    dariA.status === 404 && dariA.json?.error?.code === "ATTEMPT_NOT_FOUND",
    `status ${dariA.status}`,
  );

  const stateB = await api(user.jar, `/api/attempts/${attempt2}`);
  report(
    "state percobaan orang lain → 404 (RLS/RPC)",
    stateB.status === 404 && stateB.json?.error?.code === "ATTEMPT_NOT_FOUND",
    `status ${stateB.status}`,
  );

  // ------------------------------------------------ RPC langsung ditolak
  const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email: user.email, password: "rahasia-uji-123" }),
  });
  const tokenJson = await tokenRes.json();
  const rpcLangsung = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_attempt`, {
    method: "POST",
    headers: { apikey: ANON_KEY, authorization: `Bearer ${tokenJson.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ p_attempt_id: attemptId, p_user_id: user.userId }),
  });
  report(
    "RPC submit_attempt tak bisa dipanggil klien langsung (401/403/404)",
    rpcLangsung.status === 401 || rpcLangsung.status === 403 || rpcLangsung.status === 404,
    `status ${rpcLangsung.status}`,
  );

  // ------------------------------------------------ kuis durasi pendek (expiry)
  const kuisPendek = await client.query(
    `insert into public.quizzes (owner_id, judul, deskripsi, kesulitan, durasi_detik, status, visibilitas)
     select p.id, 'Kuis Uji Expiry', 'durasi pendek untuk uji auto-nilai', 'easy', 20, 'published', 'public'
     from public.profiles p where p.role in ('creator','admin') order by p.created_at limit 1
     returning id`,
  );
  const kuisPendekId = kuisPendek.rows[0]?.id;
  quizzesToDelete.push(kuisPendekId);

  const soalPendek = [];
  for (const [i, benar] of [true, false, true].entries()) {
    const q = await client.query(
      `insert into public.questions (quiz_id, teks, tipe, bobot, urutan, pembahasan)
       values ($1, $2, 'single', 1, $3, 'uji expiry') returning id`,
      [kuisPendekId, `Soal expiry ${i + 1}`, i],
    );
    const opsiIds = [];
    for (const [j, teks] of ["Pilihan A", "Pilihan B"].entries()) {
      const o = await client.query(
        `insert into public.options (question_id, teks, urutan) values ($1, $2, $3) returning id`,
        [q.rows[0].id, teks, j],
      );
      opsiIds.push(o.rows[0].id);
    }
    await client.query(
      `insert into public.question_keys (question_id, option_id) values ($1, $2)`,
      [q.rows[0].id, opsiIds[benar ? 0 : 1]],
    );
    soalPendek.push({ id: q.rows[0].id, benar: opsiIds[benar ? 0 : 1], opsi: opsiIds });
  }

  const user3 = await buatUserDanLogin();
  usersToDelete.push(user3.userId);
  const mulai3 = await api(user3.jar, "/api/attempts", { method: "POST", body: { quiz_id: kuisPendekId } });
  const attempt3 = mulai3.json?.data?.attempt?.id;

  // Jawab 2 dari 3 benar (soal 3 dibiarkan kosong)
  for (const [index, soal] of soalPendek.slice(0, 2).entries()) {
    await api(user3.jar, `/api/attempts/${attempt3}/answers`, {
      method: "PUT",
      body: { pertanyaan_id: soal.id, opsi_id: index === 0 ? soal.benar : soal.opsi.find((o) => o !== soal.benar) },
    });
  }

  // Paksa waktu habis (admin SQL) — started_at ikut ditarik agar constraint
  // attempts_expiry_after_start tetap sah, lalu submit → harus 409.
  await client.query(
    `update public.attempts
        set started_at = now() - interval '10 seconds',
            expires_at = now() - interval '1 second'
      where id = $1 and status = 'in_progress'`,
    [attempt3],
  );

  const submitHab = await api(user3.jar, `/api/attempts/${attempt3}/submit`, { method: "POST" });
  const habData = submitHab.json?.data?.hasil ?? submitHab.json?.error?.hasil ?? {};
  const baris = await client.query(
    `select status, skor, persentase, durasi_ms from public.attempts where id = $1`,
    [attempt3],
  );
  report(
    "submit setelah waktu habis → 409 ATTEMPT_EXPIRED + nilai dari autosave",
    submitHab.status === 409 &&
      submitHab.json?.error?.code === "ATTEMPT_EXPIRED" &&
      Number(habData.skor) === 1 &&
      baris.rows[0]?.status === "expired" &&
      Number(baris.rows[0]?.skor) === 1,
    `status ${submitHab.status}, skor ${habData.skor}, db status ${baris.rows[0]?.status}`,
  );

  // Cron expiry (memakai seed lama yang masih in_progress milik user2)
  const cronRes = await fetch(`${BASE_URL}/api/cron/expire-attempts`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  report(
    "cron expire-attempts menolak tanpa CRON_SECRET (401)",
    cronRes.status === 401,
    `status ${cronRes.status}`,
  );
} catch (error) {
  report("eksekusi e2e submit", false, error instanceof Error ? error.message : String(error));
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
  if (usersToDelete.length) console.log(`Pengguna & kuis uji dihapus (${usersToDelete.length} user).`);
}

const gagal = results.filter((r) => !r.ok);
console.log(`\nRingkasan: ${results.length - gagal.length}/${results.length} pemeriksaan lolos.`);
if (gagal.length > 0) {
  console.error("GAGAL:", gagal.map((g) => g.name).join(", "));
  process.exit(1);
}
console.log("E2E submit LULUS.");
