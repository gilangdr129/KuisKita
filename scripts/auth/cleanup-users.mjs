#!/usr/bin/env node
/**
 * Bersihkan pengguna uji dari project Supabase (dipakai saat e2e auth).
 * Menghapus user yang email-nya cocok pola uji/e2e.
 *
 *   node scripts/auth/cleanup-users.mjs            # hapus user uji
 *   node scripts/auth/cleanup-users.mjs --list      # hanya tampilkan
 */

import { readFileSync } from "node:fs";
import process from "node:process";

const listOnly = process.argv.includes("--list");
const UJI_PATTERN = /(^e2e-|^uji-|kuiskita\.test$|@example\.com$|probe-link-)/;

function parseEnvLocal() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  }
  return env;
}

const env = parseEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("SKIP: .env.local belum lengkap.");
} else {
  const headers = { apikey: key, authorization: `Bearer ${key}` };

  const listResponse = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers });
  const data = await listResponse.json();
  const users = data.users ?? [];
  const targets = users.filter((user) => UJI_PATTERN.test(user.email ?? ""));

  console.log(`Total pengguna: ${users.length}; pengguna uji: ${targets.length}`);
  for (const user of targets) {
    console.log(`  ${user.email} (terkonfirmasi: ${user.email_confirmed_at ? "ya" : "belum"})`);
  }

  if (listOnly || targets.length === 0) {
    console.log("Tidak ada yang dihapus.");
  } else {
    for (const user of targets) {
      const del = await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers });
      console.log(`  dihapus: ${user.email} -> ${del.status}`);
    }
    console.log("Bersih-bersih selesai.");
  }
}
