#!/usr/bin/env node
/**
 * Penjaga CI: gagal kalau rahasia server (service role key, DATABASE_URL,
 * token API) bocor ke bundel klien (berkas .next) atau diset sebagai variabel
 * NEXT_PUBLIC_.
 *
 * Deteksi bundel berbasis pola dan dijalankan setiap kali .next ada, tanpa
 * bergantung pada keberadaan nilai rahasia di lingkungan pemindai (CI memang
 * tidak punya nilai rahasia). Nilai persis tetap diperiksa kalau tersedia.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const PUBLIC_PREFIX = "NEXT_PUBLIC_";
const SENSITIVE_NAME_PARTS = [
  "SERVICE_ROLE",
  "DATABASE_URL",
  "SECRET",
  "TOKEN",
  "API_KEY",
  "PRIVATE",
  "PASSWORD",
];

const failures = [];

function looksLikeDbUrl(value) {
  return /^(postgres|postgresql):\/\//.test(value);
}

function decodeJwtPayload(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
  } catch {
    return null;
  }
}

/** Hanya role `service_role` yang dianggap rahasia server; anon key (role `anon`) sah. */
function isServiceRoleJwt(value) {
  const payload = decodeJwtPayload(value);
  if (payload === null || typeof payload !== "object") return false;
  return payload.role === "service_role";
}

/** True kalau nilai terbaca seperti kunci rahasia server (JWT service_role, sb_secret_, atau URL DB). */
function looksLikeSecret(value) {
  if (!value || typeof value !== "string") return false;
  if (value.startsWith("sb_secret_")) return true;
  if (looksLikeDbUrl(value)) return true;
  return isServiceRoleJwt(value);
}

const JWT_SHAPE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}/g;
const CONTENT_RULES = [
  {
    name: "DATABASE_URL",
    test: (content) => /postgres(?:ql)?:\/\/[^\s"'`<>]{8,}/.test(content),
  },
  {
    name: "sb_secret_ key",
    test: (content) => /sb_secret_[A-Za-z0-9_-]{8,}/.test(content),
  },
  {
    name: "JWT service_role (JSON)",
    test: (content) => /"role"\s*:\s*"service_role"/.test(content),
  },
  {
    name: "JWT service_role",
    test: (content) => {
      JWT_SHAPE.lastIndex = 0;
      const matches = content.match(JWT_SHAPE) ?? [];
      return matches.some((token) => isServiceRoleJwt(token));
    },
  },
];

// 1) Nama dan nilai variabel NEXT_PUBLIC_ tidak boleh terlihat seperti rahasia server.
for (const [name, value] of Object.entries(process.env)) {
  if (!name.startsWith(PUBLIC_PREFIX)) continue;
  const upperName = name.toUpperCase();
  if (SENSITIVE_NAME_PARTS.some((part) => upperName.includes(part))) {
    failures.push(`Variabel ${name} bernama sensitif namun diekspos ke klien.`);
  }
  if (looksLikeSecret(value)) {
    failures.push(`Variabel ${name} bernilai seperti kredensial server.`);
  }
}

// 2) Kalau rahasia tersedia di lingkungan (lokal/CI dengan env), periksa nilai persisnya.
const secretsToHunt = [
  { name: "SUPABASE_SERVICE_ROLE_KEY", value: process.env.SUPABASE_SERVICE_ROLE_KEY },
  { name: "DATABASE_URL", value: process.env.DATABASE_URL },
].filter((entry) => typeof entry.value === "string" && entry.value.length > 16);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full);
      continue;
    }
    try {
      const info = await stat(full);
      if (info.size > 20_000_000) continue;
      const content = await readFile(full, "utf8");
      for (const rule of CONTENT_RULES) {
        if (rule.test(content)) {
          failures.push(`${rule.name} ditemukan di bundel: ${full}`);
        }
      }
      for (const secret of secretsToHunt) {
        if (content.includes(secret.value)) {
          failures.push(`${secret.name} ditemukan di bundel: ${full}`);
        }
      }
    } catch {
      // Berkas non-teks dilewati.
    }
  }
}

// 3) Pemindaian bundel selalu dijalankan kalau .next ada (tidak syarat env rahasia).
const buildDir = path.resolve(".next");
let buildDirExists = false;
try {
  await stat(buildDir);
  buildDirExists = true;
} catch {
  buildDirExists = false;
}

if (buildDirExists) {
  await walk(buildDir);
} else {
  console.log("Catatan: .next belum ada — jalankan scan setelah `npm run build`.");
}

if (failures.length > 0) {
  console.error("Pemindaian rahasia GAGAL:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Pemindaian rahasia LULUS: tidak ada rahasia server di bundel/env NEXT_PUBLIC_.");
