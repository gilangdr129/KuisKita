#!/usr/bin/env node
/**
 * E2E profil & username OAuth (Gate F4): memastikan profil otomatis terbuat
 * dengan username turunan yang unik untuk pengguna OAuth (tanpa metadata
 * username) — sekaligus uji endpoint PATCH /api/me/profil butuh sesi.
 *
 * Jalankan dev server lebih dulu (npm run dev), lalu:
 *   node scripts/auth/e2e-profil.mjs
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

const stamp = Date.now().toString(36);
const results = [];
function report(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const headers = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
};

async function admin(path, options = {}) {
  const { body, ...rest } = options;
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...rest,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

const dibuat = [];

try {
  // -------------------------------------------- profil dari metadata Google
  const nama = "Rani Pertiwi";
  const buat1 = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email: `oauth-${stamp}-1@example.com`,
      password: "rahasia-uji-123",
      email_confirm: true,
      user_metadata: { full_name: nama, name: nama, avatar_url: null, provider: "google" },
    },
  });
  const user1 = buat1.json;
  dibuat.push(user1?.id);
  report("pengguna OAuth dibuat (metadata full_name)", Boolean(user1?.id), `status ${buat1.status}`);

  const profil1 = await admin(`/rest/v1/profiles?select=username&id=eq.${user1?.id}`);
  const username1 = profil1.json?.[0]?.username;
  report(
    "username diturunkan dari full_name",
    username1 === "rani_pertiwi",
    `username: ${username1}`,
  );

  // -------------------------------------------- username ganda → sufiks unik
  const buat2 = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email: `oauth-${stamp}-2@example.com`,
      password: "rahasia-uji-123",
      email_confirm: true,
      user_metadata: { full_name: nama, provider: "google" },
    },
  });
  const user2 = buat2.json;
  dibuat.push(user2?.id);

  const profil2 = await admin(`/rest/v1/profiles?select=username&id=eq.${user2?.id}`);
  const username2 = profil2.json?.[0]?.username;
  report(
    "username kedua tetap unik (sufiks acak)",
    typeof username2 === "string" && username2 !== username1 && username2.startsWith("rani_pertiwi"),
    `username: ${username2}`,
  );

  // -------------------------------------------- tanpa metadata (email only)
  const buat3 = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: { email: `budi.santoso.${stamp}@example.com`, password: "rahasia-uji-123", email_confirm: true },
  });
  const user3 = buat3.json;
  dibuat.push(user3?.id);

  const profil3 = await admin(`/rest/v1/profiles?select=username&id=eq.${user3?.id}`);
  const username3 = profil3.json?.[0]?.username;
  report(
    "username diturunkan dari email local part",
    username3?.startsWith("budi.santoso") || username3?.startsWith("budi_santoso"),
    `username: ${username3}`,
  );

  // -------------------------------------------- endpoint profil butuh sesi
  const tanpaSesi = await fetch(`${BASE_URL}/api/me/profil`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "coba_ubah" }),
  });
  report(
    "PATCH /api/me/profil tanpa sesi → 401",
    tanpaSesi.status === 401,
    `status ${tanpaSesi.status}`,
  );

  // -------------------------------------------- ubah username dengan sesi
  const login = await fetch(`${BASE_URL}/api/auth/masuk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `oauth-${stamp}-1@example.com`, password: "rahasia-uji-123" }),
  });
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  report("pengguna OAuth bisa masuk dengan password", login.status === 200, `status ${login.status}`);

  const ubah = await fetch(`${BASE_URL}/api/me/profil`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ username: `rani_baru_${stamp}`.slice(0, 20) }),
  });
  const ubahBody = await ubah.json().catch(() => null);
  report(
    "PATCH /api/me/profil dengan sesi → username berubah",
    ubah.status === 200 && ubahBody?.data?.username?.startsWith("rani_baru_"),
    `status ${ubah.status}, ${ubahBody?.data?.username ?? ""}`,
  );

  const ganda = await fetch(`${BASE_URL}/api/me/profil`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ username: username2 }),
  });
  report(
    "username milik pengguna lain → 409 USERNAME_TAKEN",
    ganda.status === 409 && gandaBodyIsTaken(await ganda.json().catch(() => null)),
    `status ${ganda.status} (username2: ${username2})`,
  );
} catch (error) {
  report("eksekusi e2e profil", false, error instanceof Error ? error.message : String(error));
} finally {
  for (const id of dibuat) {
    if (!id) continue;
    await admin(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  }
  if (dibuat.length > 0) console.log(`Pengguna uji dihapus (${dibuat.length}).`);
}

function gandaBodyIsTaken(body) {
  return Boolean(body?.error?.code === "USERNAME_TAKEN");
}

const gagal = results.filter((r) => !r.ok);
console.log(`\nRingkasan: ${results.length - gagal.length}/${results.length} pemeriksaan lolos.`);
if (gagal.length > 0) {
  console.error("GAGAL:", gagal.map((g) => g.name).join(", "));
  process.exit(1);
}
console.log("E2E profil LULUS.");
