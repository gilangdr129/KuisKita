import { readFileSync } from "node:fs";

const lines = readFileSync("supabase/migrations/20261113060001_pencarian_relevan.sql", "utf8").split("\n");
let depth = 0;
let maks = 0;
for (const [index, raw] of lines.entries()) {
  let inString = false;
  for (const ch of raw) {
    if (ch === "'") inString = !inString;
    if (!inString && ch === "(") depth += 1;
    else if (!inString && ch === ")") depth -= 1;
    if (depth < 0) {
      console.log(`KELEBIHAN ')' baris ${index + 1}`);
      depth = 0;
    }
  }
  maks = Math.max(maks, depth);
}
console.log(`Kedalaman akhir: ${depth} (harus 0)`);
console.log(`Kedalaman maksimum: ${maks}`);