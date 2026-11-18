#!/usr/bin/env node
/**
 * E2E Turnstile (Gate F18) — dijalankan terpisah karena Next 16 hanya
 * mengizinkan satu dev server per proyek. Jalankan dev server dengan secret
 * kunci uji Cloudflare yang sesuai, lalu:
 *
 *   # server: TURNSTILE_SECRET_KEY=2x0000000000000000000000000000000AA (selalu-gagal)
 *   TURNSTILE_MODE=gagal node scripts/auth/e2e-turnstile.mjs
 *
 *   # server: TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA (selalu-lolos)
 *   TURNSTILE_MODE=lolos node scripts/auth/e2e-turnstile.mjs
 */

import process from "node:process";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const MODE = process.env.TURNSTILE_MODE ?? "gagal";
const SEED_EMAIL = "creator.kuiskita@example.com";
const SEED_PASSWORD = "kuiskita-seed-2026";

const results = [];
function report(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(token) {
  const res = await fetch(`${BASE_URL}/api/auth/masuk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: SEED_EMAIL,
      password: SEED_PASSWORD,
      ...(token ? { turnstile_token: token } : {}),
    }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

if (MODE === "gagal") {
  const hasil = await login("token-palsu-apa-saja");
  report(
    "secret selalu-gagal: login dengan token apa pun → 400 TURNSTILE_FAILED",
    hasil.status === 400 && hasil.json?.error?.code === "TURNSTILE_FAILED",
    `status ${hasil.status}, kode ${hasil.json?.error?.code}`,
  );
} else if (MODE === "lolos") {
  const hasil = await login("token-apa-saja");
  report(
    "secret selalu-lolos: login dengan token apa pun → 200",
    hasil.status === 200,
    `status ${hasil.status}`,
  );

  const tanpaToken = await login(undefined);
  report(
    "secret aktif: tanpa token → 400 TURNSTILE_REQUIRED",
    tanpaToken.status === 400 && tanpaToken.json?.error?.code === "TURNSTILE_REQUIRED",
    `status ${tanpaToken.status}, kode ${tanpaToken.json?.error?.code}`,
  );
} else {
  console.error("TURNSTILE_MODE harus 'gagal' atau 'lolos'.");
  process.exit(1);
}

const gagal = results.filter((r) => !r.ok);
console.log(`\nRingkasan: ${results.length - gagal.length}/${results.length} pemeriksaan lolos.`);
if (gagal.length > 0) process.exit(1);
console.log(`E2E turnstile (${MODE}) LULUS.`);