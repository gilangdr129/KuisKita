#!/usr/bin/env node
/**
 * E2E unggahan & avatar (Gate F5): unggah valid → URL publik + avatar_url
 * tersimpan; tolak tipe/ukuran; username duplikat case-insensitive → 409.
 *
 * Jalankan dev server lebih dulu (npm run dev), lalu:
 *   node scripts/auth/e2e-upload.mjs
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

const BUCKET = "media-kuis";
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const GIF_BYTES = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(16)]);
const PNG_OVER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(2 * 1024 * 1024 + 64),
]);

const stamp = Date.now().toString(36);
const email = `upload-${stamp}@example.com`;
const username = `up_${stamp}`.slice(0, 20);

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

async function admin(path, options = {}) {
  const { body, ...rest } = options;
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...rest,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: serviceHeaders,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function upload(jar, { bytes, type, tujuan = "avatar" }) {
  const form = new FormData();
  form.set("file", new Blob([bytes], { type }), "berkas-uji");
  if (tujuan !== null) form.set("tujuan", tujuan);

  const res = await fetch(`${BASE_URL}/api/uploads`, {
    method: "POST",
    body: form,
    headers: jar ? { cookie: jar.header() } : {},
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

let userId = null;

try {
  // ---------------------------------------------------------------- siapkan user
  const created = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password: "rahasia-uji-123", email_confirm: true, user_metadata: { username } },
  });
  userId = created.json?.id;
  report("pengguna uji dibuat", Boolean(userId), `status ${created.status}`);

  const jar = createJar();
  const login = await fetch(`${BASE_URL}/api/auth/masuk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "rahasia-uji-123" }),
  });
  jar.absorb(login);
  report("login pengguna uji", login.status === 200, `status ${login.status}`);

  // ---------------------------------------------------------------- unggah valid
  const okUpload = await upload(jar, { bytes: PNG_1x1, type: "image/png", tujuan: "avatar" });
  const url = okUpload.json?.data?.url ?? "";
  report(
    "unggah PNG valid → 201 + URL publik",
    okUpload.status === 201 && url.includes(`/storage/v1/object/public/${BUCKET}/avatar/${userId}/`),
    url.slice(0, 90),
  );

  const namaAcak = url.split("/").pop() ?? "";
  report("nama berkas acak (UUID, bukan nama asli)", /^[0-9a-f-]{36}\.png$/.test(namaAcak), namaAcak);

  const gambar = await fetch(url);
  report("URL publik dapat diakses publik", gambar.status === 200, `status ${gambar.status}`);

  const profil = await admin(`/rest/v1/profiles?select=avatar_url&id=eq.${userId}`);
  report(
    "avatar_url tersimpan di profil",
    profil.json?.[0]?.avatar_url === url,
    String(profil.json?.[0]?.avatar_url ?? "null").slice(0, 80),
  );

  // ---------------------------------------------------------------- penolakan
  const salahTipe = await upload(jar, { bytes: GIF_BYTES, type: "image/gif" });
  report(
    "GIF ditolak 400 FILE_TYPE_NOT_ALLOWED",
    salahTipe.status === 400 && salahTipe.json?.error?.code === "FILE_TYPE_NOT_ALLOWED",
    `status ${salahTipe.status}, ${salahTipe.json?.error?.code ?? ""}`,
  );

  const terlaluBesar = await upload(jar, { bytes: PNG_OVER, type: "image/png" });
  report(
    "gambar > 2 MB ditolak 400 FILE_TOO_LARGE",
    terlaluBesar.status === 400 && terlaluBesar.json?.error?.code === "FILE_TOO_LARGE",
    `status ${terlaluBesar.status}, ${terlaluBesar.json?.error?.code ?? ""}`,
  );

  const tujuanSalah = await upload(jar, { bytes: PNG_1x1, type: "image/png", tujuan: "lain" });
  report(
    "tujuan tidak valid ditolak 400 VALIDATION_ERROR",
    tujuanSalah.status === 400 && tujuanSalah.json?.error?.code === "VALIDATION_ERROR",
    `status ${tujuanSalah.status}`,
  );

  const tanpaSesi = await upload(null, { bytes: PNG_1x1, type: "image/png" });
  report("unggah tanpa sesi → 401", tanpaSesi.status === 401, `status ${tanpaSesi.status}`);

  // ------------------------------------------------------- username case-insensitive
  const gandaKapitalResponse = await fetch(`${BASE_URL}/api/me/profil`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: jar.header() },
    body: JSON.stringify({ username: username.toUpperCase() }),
  });
  const gandaKapital = {
    status: gandaKapitalResponse.status,
    json: await gandaKapitalResponse.json().catch(() => null),
  };
  report(
    "username duplikat beda kapital → 409 USERNAME_TAKEN",
    gandaKapital.status === 409 && gandaKapital.json?.error?.code === "USERNAME_TAKEN",
    `status ${gandaKapital.status}, ${gandaKapital.json?.error?.code ?? ""}`,
  );

  const ubahBaruResponse = await fetch(`${BASE_URL}/api/me/profil`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: jar.header() },
    body: JSON.stringify({ username: `${username}_b`.slice(0, 20) }),
  });
  const ubahBaru = {
    status: ubahBaruResponse.status,
    json: await ubahBaruResponse.json().catch(() => null),
  };
  report(
    "ubah username baru berhasil (tersimpan lowercase)",
    ubahBaru.status === 200,
    `status ${ubahBaru.status}, ${ubahBaru.json?.data?.username ?? ""}`,
  );
} catch (error) {
  report("eksekusi e2e upload", false, error instanceof Error ? error.message : String(error));
} finally {
  if (userId) {
    const del = await admin(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
    report("pengguna uji dihapus", del.status === 200 || del.status === 204, `status ${del.status}`);
  }
}

const gagal = results.filter((r) => !r.ok);
console.log(`\nRingkasan: ${results.length - gagal.length}/${results.length} pemeriksaan lolos.`);
if (gagal.length > 0) {
  console.error("GAGAL:", gagal.map((g) => g.name).join(", "));
  process.exit(1);
}
console.log("E2E upload LULUS.");
