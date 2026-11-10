#!/usr/bin/env node
/**
 * E2E auth KuisKita (Gate F3): daftar → verifikasi email → masuk → keluar →
 * reset password → masuk dengan password baru.
 *
 * Tautan email dibuat lewat Supabase Admin API (generateLink) — persis URL yang
 * akan dikirim email, termasuk redirect ke aplikasi. Tanpa SMTP kustom, layanan
 * email bawaan Supabase Free dibatasi, sehingga langkah "daftar publik" dapat
 * TERSKIP (ditandai jelas) dan user uji dibuat via admin API.
 *
 * Jalankan dev server lebih dulu (npm run dev), lalu:
 *   node scripts/auth/e2e-auth.mjs
 *   BASE_URL=https://staging-anda node scripts/auth/e2e-auth.mjs   # opsional
 *
 * Pengguna uji dibuat di project Supabase nyata dan DIHAPUS lagi di akhir.
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
  console.error("SKIP: .env.local belum memuat NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(0);
}

const stamp = Date.now().toString(36);
// example.com = domain reserved RFC 2606 (tidak punya inbox nyata).
const email = `e2e-${stamp}@example.com`;
const username = `e2e_${stamp}`;
const password = "rahasia-uji-123";
const passwordBaru = "rahasia-baru-456";

const results = [];
function report(name, ok, detail = "") {
  const status = ok === "SKIP" ? "SKIP" : ok ? "PASS" : "FAIL";
  results.push({ name, ok: status !== "FAIL", status });
  console.log(`${status}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function createJar() {
  const cookies = new Map();
  return {
    absorb(headers) {
      for (const raw of headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(";");
        const idx = pair.indexOf("=");
        if (idx > 0) cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    get size() {
      return cookies.size;
    },
  };
}

/** GET/POST mengikuti redirect manual agar cookie tiap langkah tercatat. */
async function follow(url, { method = "GET", body, jar, maxHops = 8 } = {}) {
  let current = new URL(url);
  let lastResponse;

  for (let hop = 0; hop < maxHops; hop += 1) {
    const response = await fetch(current, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(jar && jar.size ? { cookie: jar.header() } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    if (jar) jar.absorb(response.headers);
    lastResponse = response;

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current);
      continue;
    }
    return { response, url: current.toString(), jar };
  }
  throw new Error(`Terlalu banyak redirect dari ${url}`);
}

async function api(path, { method = "GET", body, jar } = {}) {
  const { response } = await follow(`${BASE_URL}${path}`, { method, body, jar });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

async function admin(path, options = {}) {
  const { body, ...rest } = options;
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...rest,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      ...(rest.headers ?? {}),
    },
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

let createdUserId = null;
let sesiLangsung = false;

try {
  // ---------------------------------------------------------------- daftar
  const daftar = await api("/api/auth/daftar", {
    method: "POST",
    body: { email, username, password, konfirmasi: password },
  });

  if (daftar.status === 201 && daftar.json?.data?.id) {
    report("daftar akun baru (endpoint publik)", true, `status 201, email ${email}`);
    createdUserId = daftar.json.data.id;
    sesiLangsung = Boolean(daftar.json.data.session_aktif);
    if (sesiLangsung) {
      report("sesi dibuat langsung saat daftar", true, "Confirm email nonaktif di project");
    }
  } else if (daftar.json?.error?.message?.includes("rate limit")) {
    report(
      "daftar akun baru (endpoint publik)",
      "SKIP",
      "layanan email bawaan Supabase dibatasi (rate limit) — aktifkan SMTP kustom/Resend; user uji dibuat via admin API agar alur lain tetap teruji",
    );
    const created = await admin("/auth/v1/admin/users", {
      method: "POST",
      body: { email, password, email_confirm: false, user_metadata: { username } },
    });
    createdUserId = created.json?.id ?? null;
    report("user uji dibuat (admin API, tanpa email)", Boolean(createdUserId), `status ${created.status}`);
  } else {
    report("daftar akun baru (endpoint publik)", false, `status ${daftar.status}, ${daftar.json?.error?.message ?? ""}`);
    throw new Error("daftar gagal, hentikan");
  }
  if (!createdUserId) throw new Error("user uji tidak terbentuk, hentikan");

  // -------------------------------------------------- profil otomatis (F1)
  const profil = await admin(`/rest/v1/profiles?select=username,role&id=eq.${createdUserId}`);
  const profilRow = profil.json?.[0];
  report(
    "profil otomatis terbuat dengan username & role player",
    profilRow?.username === username && profilRow?.role === "player",
    JSON.stringify(profilRow ?? {}),
  );

  // ------------------------------------------- email belum terkonfirmasi
  const userBefore = await admin(`/auth/v1/admin/users/${createdUserId}`);
  if (sesiLangsung) {
    report(
      "email_confirmed_at terisi saat daftar",
      Boolean(userBefore.json?.email_confirmed_at),
      "Confirm email nonaktif di project (setelan valid untuk MVP awal)",
    );
  } else {
    report(
      "email_confirmed_at masih null sebelum verifikasi",
      userBefore.json?.email_confirmed_at == null,
      String(userBefore.json?.email_confirmed_at),
    );
  }

  // ------------------------------------------- masuk ditolak sebelum verifikasi
  const masukAwal = await api("/api/auth/masuk", { method: "POST", body: { email, password } });
  if (sesiLangsung) {
    report(
      "masuk sebelum verifikasi (ditolak 403)",
      "SKIP",
      "tidak berlaku: Confirm email nonaktif, akun langsung aktif",
    );
  } else {
    report(
      "masuk ditolak sebelum verifikasi (403 EMAIL_NOT_CONFIRMED)",
      masukAwal.status === 403 && masukAwal.json?.error?.code === "EMAIL_NOT_CONFIRMED",
      `status ${masukAwal.status}, ${masukAwal.json?.error?.code ?? ""}`,
    );
  }

  // ---------------------------------------------------- verifikasi via tautan
  if (sesiLangsung) {
    report(
      "tautan verifikasi dibuat (admin generateLink)",
      "SKIP",
      "akun sudah terkonfirmasi sejak pendaftaran (Confirm email nonaktif)",
    );
    report("tautan verifikasi mendarat di aplikasi", "SKIP", "tidak diperlukan untuk konfigurasi ini");
    report(
      "email terkonfirmasi setelah tautan dibuka",
      "SKIP",
      "sudah terkonfirmasi sejak awal — tercatat pada langkah sebelumnya",
    );
  } else {
    const link = await admin("/auth/v1/admin/generate_link", {
      method: "POST",
      body: { type: "signup", email, password, options: { redirect_to: `${BASE_URL}/auth/callback?next=/` } },
    });
    report(
      "tautan verifikasi dibuat (admin generateLink)",
      link.status === 200 && Boolean(link.json?.action_link),
      link.json?.action_link?.split("?")[0] ?? "—",
    );

    if (link.json?.action_link) {
      const verifyLanding = await follow(link.json.action_link, { jar: createJar() });
      const verifyUrl = new URL(verifyLanding.url);
      const verifyFragment = new URLSearchParams(verifyUrl.hash.replace(/^#/, ""));
      const verifyIsCode = Boolean(verifyUrl.searchParams.get("code"));
      const verifyIsImplicit = Boolean(verifyFragment.get("access_token"));
      report(
        "tautan verifikasi mendarat di aplikasi (PKCE ?code atau token fragment)",
        verifyLanding.url.startsWith(BASE_URL) && (verifyIsCode || verifyIsImplicit),
        `${verifyIsCode ? "PKCE code" : "implicit token"} di ${verifyUrl.pathname}`,
      );
    }

    const userAfter = await admin(`/auth/v1/admin/users/${createdUserId}`);
    report(
      "email terkonfirmasi setelah tautan dibuka",
      Boolean(userAfter.json?.email_confirmed_at),
      String(userAfter.json?.email_confirmed_at ?? "null"),
    );
  }

  // ------------------------------------------------------------ masuk (sesi)
  const sessionJar = createJar();
  const masuk = await api("/api/auth/masuk", {
    method: "POST",
    body: { email, password },
    jar: sessionJar,
  });
  report(
    "masuk setelah verifikasi (cookie sesi terpasang)",
    masuk.status === 200 && Boolean(masuk.json?.data?.id),
    `status ${masuk.status}`,
  );

  const profilHtml = await api("/profil", { jar: sessionJar });
  report(
    "sesi aktif: GET /profil mengembalikan 200 (bukan redirect)",
    profilHtml.status === 200 && sessionJar.size > 0,
    `status ${profilHtml.status}, cookie: ${sessionJar.size}`,
  );

  // ------------------------------------------------------------ keluar
  const keluar = await api("/api/auth/keluar", { method: "POST", jar: sessionJar });
  report("keluar berhasil", keluar.status === 200 && keluar.json?.data?.success === true);

  const guardSetelahKeluar = await fetch(`${BASE_URL}/profil`, { redirect: "manual" });
  const guardLocation = guardSetelahKeluar.headers.get("location");
  report(
    "setelah keluar, /profil dialihkan ke /masuk (guard bekerja)",
    guardSetelahKeluar.status === 307 && (guardLocation ?? "").includes("/masuk"),
    `status ${guardSetelahKeluar.status} -> ${guardLocation}`,
  );

  // ------------------------------------------------------------ reset password
  const recovery = await admin("/auth/v1/admin/generate_link", {
    method: "POST",
    body: {
      type: "recovery",
      email,
      options: { redirect_to: `${BASE_URL}/auth/callback?next=/perbarui-sandi` },
    },
  });
  report(
    "tautan reset password dibuat",
    recovery.status === 200 && Boolean(recovery.json?.action_link),
    recovery.json?.action_link?.split("?")[0] ?? "—",
  );

  const recoveryLanding = await follow(recovery.json.action_link, { jar: createJar() });
  const recoveryUrl = new URL(recoveryLanding.url);
  const recoveryFragment = new URLSearchParams(recoveryUrl.hash.replace(/^#/, ""));
  report(
    "tautan reset mendarat di aplikasi (token recovery / code)",
    recoveryLanding.url.startsWith(BASE_URL) &&
      (recoveryFragment.get("type") === "recovery" || recoveryUrl.searchParams.get("code")),
    recoveryUrl.pathname,
  );

  // Tautan buatan admin memakai implicit flow (token di fragment) — sesi uji
  // dibangun lewat login password; jalur PKCE (?code → /auth/callback) berlaku
  // untuk tautan sungguhan dari aplikasi dan diuji manual di browser.
  const recoveryJar = createJar();
  const loginSebelumUpdate = await api("/api/auth/masuk", {
    method: "POST",
    jar: recoveryJar,
    body: { email, password },
  });
  const perbarui = await api("/api/auth/perbarui-sandi", {
    method: "POST",
    jar: recoveryJar,
    body: { password: passwordBaru, konfirmasi: passwordBaru },
  });
  report(
    "password baru tersimpan lewat endpoint terproteksi",
    perbarui.status === 200 && perbarui.json?.data?.updated === true,
    `status ${perbarui.status} (login sesi: ${loginSebelumUpdate.status})`,
  );

  await api("/api/auth/keluar", { method: "POST", jar: recoveryJar });

  const masukPasswordBaru = await api("/api/auth/masuk", {
    method: "POST",
    jar: createJar(),
    body: { email, password: passwordBaru },
  });
  report(
    "masuk dengan password baru",
    masukPasswordBaru.status === 200 && Boolean(masukPasswordBaru.json?.data?.id),
    `status ${masukPasswordBaru.status}`,
  );

  const passwordLama = await api("/api/auth/masuk", {
    method: "POST",
    body: { email, password },
  });
  report(
    "password lama ditolak setelah reset",
    passwordLama.status === 401 && passwordLama.json?.error?.code === "INVALID_CREDENTIALS",
    `status ${passwordLama.status}`,
  );

  // ------------------------------------------------------------ username ganda
  const daftarGanda = await api("/api/auth/daftar", {
    method: "POST",
    body: {
      email: `lain-${stamp}@example.com`,
      username,
      password: "rahasia-uji-789",
      konfirmasi: "rahasia-uji-789",
    },
  });
  if (daftarGanda.json?.error?.message?.includes("rate limit")) {
    report(
      "username ganda ditolak endpoint",
      "SKIP",
      "diblokir rate limit email; diperiksa lewat trigger DB (admin API) sebagai gantinya",
    );
    const gandaAdmin = await admin("/auth/v1/admin/users", {
      method: "POST",
      body: {
        email: `ganda-${stamp}@example.com`,
        password: "rahasia-uji-789",
        email_confirm: false,
        user_metadata: { username },
      },
    });
    const pesan = gandaAdmin.json?.message ?? gandaAdmin.json?.error_description ?? "";
    report(
      "trigger DB menolak username ganda",
      gandaAdmin.status >= 400 && String(pesan).includes("username sudah dipakai"),
      `status ${gandaAdmin.status}: ${String(pesan).slice(0, 60)}`,
    );
  } else {
    report(
      "username ganda ditolak 409 USERNAME_TAKEN",
      daftarGanda.status === 409 && daftarGanda.json?.error?.code === "USERNAME_TAKEN",
      `status ${daftarGanda.status}, ${daftarGanda.json?.error?.message ?? ""}`,
    );
  }

  // ------------------------------------------------------------ validasi form
  const daftarInvalid = await api("/api/auth/daftar", {
    method: "POST",
    body: { email: "bukan-email", username: "X", password: "1", konfirmasi: "2" },
  });
  report(
    "input tidak valid → 400 VALIDATION_ERROR",
    daftarInvalid.status === 400 && daftarInvalid.json?.error?.code === "VALIDATION_ERROR",
    daftarInvalid.json?.error?.message?.slice(0, 80),
  );

  console.log("\nCatatan: rate limit masih stub (fail-open) sampai F18 — PRD §16.");
} catch (error) {
  report("eksekusi e2e", false, error instanceof Error ? error.message : String(error));
} finally {
  if (createdUserId) {
    const del = await admin(`/auth/v1/admin/users/${createdUserId}`, { method: "DELETE" });
    report("pengguna uji dihapus dari project", del.status === 200 || del.status === 204, `status ${del.status}`);
  }
}

const gagal = results.filter((r) => r.status === "FAIL");
const dilewati = results.filter((r) => r.status === "SKIP");
console.log(
  `\nRingkasan: ${results.length - gagal.length - dilewati.length} lolos, ${dilewati.length} dilewati, ${gagal.length} gagal dari ${results.length} pemeriksaan.`,
);
if (dilewati.length > 0) console.log("Dilewati:", dilewati.map((g) => g.name).join(", "));
if (gagal.length > 0) {
  console.error("GAGAL:", gagal.map((g) => g.name).join(", "));
  process.exit(1);
}
console.log("E2E auth LULUS.");
