import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const BASE = "http://localhost:3000";
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" };

const login = await fetch(`${BASE}/api/auth/masuk`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "creator.kuiskita@example.com", password: "kuiskita-seed-2026" }),
});
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

const api = (method, path, body) =>
  fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

const kuis = await api("POST", "/api/creator/quizzes", {
  judul: `Debug Skor Drift ${Date.now()}`,
  durasi_detik: 600,
  kesulitan: "easy",
});
const quizId = kuis.json?.data?.id;
await api("PUT", `/api/creator/quizzes/${quizId}/questions`, {
  soal: [{ teks: "Soal drift", tipe: "single", bobot: 2, opsi: [{ teks: "A" }, { teks: "B" }] }],
});
const muat = await api("GET", `/api/creator/quizzes/${quizId}/questions`);
const soal = (muat.json?.data?.soal ?? [])[0];
await api("PUT", `/api/creator/quizzes/${quizId}/kunci`, { question_id: soal.id, option_id: soal.opsi[0].id });
await api("POST", `/api/creator/quizzes/${quizId}/publish`);

const mulai = await api("POST", "/api/attempts", { quiz_id: quizId });
const attemptId = mulai.json?.data?.attempt?.id;
await api("PUT", `/api/attempts/${attemptId}/answers`, { pertanyaan_id: soal.id, opsi_id: soal.opsi[0].id });
const submit = await api("POST", `/api/attempts/${attemptId}/submit`);
console.log("submit:", submit.status, "skor:", submit.json?.data?.skor, "persentase:", submit.json?.data?.persentase);

await fetch(`${URL}/rest/v1/attempt_answers?attempt_id=eq.${attemptId}`, { method: "DELETE", headers: H });
await fetch(`${URL}/rest/v1/attempts?quiz_id=eq.${quizId}`, { method: "DELETE", headers: H });
await fetch(`${URL}/rest/v1/quizzes?id=eq.${quizId}`, { method: "DELETE", headers: H });
console.log("BERSIH");