#!/usr/bin/env node
/**
 * E2E editor soal — Gate F13:
 *   - soal + opsi + kunci tersimpan (kunci dikirim terpisah: question_id+option_id)
 *   - payload SEMUA endpoint editor tidak pernah memuat question_keys
 *   - gambar soal tampil (diunggah lewat F5, muncul di halaman pratinjau)
 *   - pratinjau draft akurat + hanya pemilik (token kedaluwarsa/orang lain → 404)
 *   - edit struktur saat ada attempt → 409 STRUCTURE_LOCKED
 *
 * Jalankan dev server (npm run dev) dan seed (npm run db:seed) lebih dulu:
 *   node scripts/auth/e2e-soal.mjs
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

const SEED_EMAIL = "creator.kuiskita@example.com";
const SEED_PASSWORD = "kuiskita-seed-2026";

const results = [];
function report(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const serviceHeaders = {
  apikey: SERVICE_KEY,
  authorization: `Bearer ${SERVICE_KEY}`,
  "content-type": "application/json",
};

async function login(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/masuk`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) return null;
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

function api(method, path, cookie, body) {
  return fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null), teks: "" }));
}

function halaman(path, cookie) {
  return fetch(`${BASE_URL}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  }).then(async (res) => ({ status: res.status, teks: await res.text(), lokasi: res.headers.get("location") }));
}

async function buatPengguna(email, role) {
  const dibuat = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({ email, password: "kuiskita-uji-2026", email_confirm: true }),
  });
  const user = await dibuat.json();
  const id = user?.id;
  if (!id) throw new Error(`gagal membuat pengguna ${email}`);
  if (role) {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}`, {
      method: "PATCH",
      headers: serviceHeaders,
      body: JSON.stringify({ role }),
    });
  }
  return id;
}

async function hapusPengguna(id) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: serviceHeaders });
}

/** Semua payload editor yang diperiksa dalam satu tempat (tes snapshot). */
const payloadEditor = [];
function catatPayload(nama, isi) {
  payloadEditor.push({ nama, isi: JSON.stringify(isi ?? null) });
}

try {
  const stempel = Date.now();
  const cookieSeed = await login(SEED_EMAIL, SEED_PASSWORD);
  report("kreator seed bisa masuk", Boolean(cookieSeed));

  const idPemain = await buatPengguna(`soal-uji-pemain-${stempel}@example.com`, null);
  const idKreatorB = await buatPengguna(`soal-uji-b-${stempel}@example.com`, "creator");
  const cookiePemain = await login(`soal-uji-pemain-${stempel}@example.com`, "kuiskita-uji-2026");
  const cookieB = await login(`soal-uji-b-${stempel}@example.com`, "kuiskita-uji-2026");
  report(
    "pengguna uji siap (pemain + kreator B)",
    Boolean(cookiePemain && cookieB),
  );

  // ---------------------------------------------- gambar soal (unggah F5)
  const PNG_1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const formGambar = new FormData();
  formGambar.append("tujuan", "soal");
  formGambar.append("file", new Blob([PNG_1x1], { type: "image/png" }), "gambar-soal.png");
  const unggah = await fetch(`${BASE_URL}/api/uploads`, {
    method: "POST",
    headers: { cookie: cookieSeed },
    body: formGambar,
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));
  const gambarUrl = unggah.json?.data?.url ?? null;
  report("gambar soal terunggah lewat F5", unggah.status === 201 && Boolean(gambarUrl), gambarUrl ?? "");

  // ---------------------------------------------- buat kuis draf
  const kuis = await api("POST", "/api/creator/quizzes", cookieSeed, {
    judul: `Kuis Editor Soal Uji ${stempel}`,
    durasi_detik: 600,
    kesulitan: "medium",
    kategori: "sains",
  });
  const quizId = kuis.json?.data?.id ?? null;
  report("kuis draf untuk editor dibuat", kuis.status === 201 && Boolean(quizId));

  const struktur = {
    soal: [
      {
        teks: "Ibu kota Indonesia?",
        tipe: "single",
        bobot: 2,
        pembahasan: "Jakarta adalah ibu kota negara.",
        opsi: [{ teks: "Jakarta" }, { teks: "Bandung" }, { teks: "Surabaya" }, { teks: "Medan" }],
      },
      { teks: "Borobudur terletak di Jawa Tengah.", tipe: "boolean", opsi: [{ teks: "Benar" }, { teks: "Salah" }] },
      {
        teks: "Soal dengan gambar: apa warna langit?",
        tipe: "single",
        opsi: [{ teks: "Biru" }, { teks: "Hijau" }],
        gambar_url: gambarUrl,
      },
    ],
  };

  const simpan = await api("PUT", `/api/creator/quizzes/${quizId}/questions`, cookieSeed, struktur);
  catatPayload("PUT questions", simpan.json);
  const soalTersimpan = simpan.json?.data?.soal ?? [];
  report(
    "PUT soal+opsi → 200 + id dikembalikan (urutan sesuai posisi)",
    simpan.status === 200 &&
      soalTersimpan.length === 3 &&
      soalTersimpan[0]?.opsi?.length === 4 &&
      soalTersimpan[1]?.opsi?.length === 2 &&
      soalTersimpan[0]?.urutan === 1 &&
      soalTersimpan[2]?.urutan === 3,
    `${soalTersimpan.length} soal`,
  );

  // ---------------------------------------------- kunci jawaban (terpisah)
  const kunciBenar = [
    { soal: 0, opsi: 0 }, // Jakarta
    { soal: 1, opsi: 0 }, // Benar
    { soal: 2, opsi: 0 }, // Biru
  ];
  let kunciGagal = 0;
  for (const { soal, opsi } of kunciBenar) {
    const tersimpan = soalTersimpan[soal];
    const res = await api("PUT", `/api/creator/quizzes/${quizId}/kunci`, cookieSeed, {
      question_id: tersimpan.id,
      option_id: tersimpan.opsi[opsi].id,
    });
    catatPayload("PUT kunci", res.json);
    if (res.status !== 200 || res.json?.data?.tersimpan !== true) kunciGagal += 1;
  }
  report("PUT kunci (question_id+option_id) → 200 tersimpan", kunciGagal === 0, `${3 - kunciGagal}/3`);

  // Kunci benar-benar ada di database (lewat service role).
  const kunciDb = await fetch(
    `${SUPABASE_URL}/rest/v1/question_keys?select=question_id,option_id&question_id=in.(${soalTersimpan.map((s) => s.id).join(",")})`,
    { headers: serviceHeaders },
  ).then((r) => r.json());
  const kunciMap = new Map((kunciDb ?? []).map((k) => [k.question_id, k.option_id]));
  const kunciCocok =
    kunciMap.get(soalTersimpan[0].id) === soalTersimpan[0].opsi[0].id &&
    kunciMap.get(soalTersimpan[1].id) === soalTersimpan[1].opsi[0].id &&
    kunciMap.get(soalTersimpan[2].id) === soalTersimpan[2].opsi[0].id;
  report("question_keys tersimpan sesuai pilihan di DB", kunciCocok, `${kunciMap.size}/3 baris`);

  // ---------------------------------------------- snapshot payload: tanpa question_keys
  const muatan = payloadEditor.map((p) => p.isi).join("\n");
  report(
    "payload editor tidak pernah memuat 'question_keys'",
    !muatan.includes("question_keys"),
    `${payloadEditor.length} payload diperiksa`,
  );

  // ---------------------------------------------- GET struktur editor
  const muatSoal = await api("GET", `/api/creator/quizzes/${quizId}/questions`, cookieSeed);
  catatPayload("GET questions", muatSoal.json);
  const soalEditor = muatSoal.json?.data?.soal ?? [];
  report(
    "GET struktur: 3 soal + opsi_benar_id preselect + gambar_url",
    muatSoal.status === 200 &&
      soalEditor.length === 3 &&
      soalEditor[0]?.opsi_benar_id === soalTersimpan[0].opsi[0].id &&
      soalEditor[1]?.opsi_benar_id === soalTersimpan[1].opsi[0].id &&
      soalEditor[2]?.gambar_url === gambarUrl,
    `opsi_benar soal1: ${soalEditor[0]?.opsi_benar_id === soalTersimpan[0].opsi[0].id}`,
  );

  // ---------------------------------------------- validasi input
  const kasus = [
    ["teks soal 1001 karakter", { soal: [{ teks: "a".repeat(1001), tipe: "single", opsi: [{ teks: "A" }, { teks: "B" }] }] }],
    ["1 opsi saja", { soal: [{ teks: "Soal", tipe: "single", opsi: [{ teks: "A" }] }] }],
    ["9 opsi", { soal: [{ teks: "Soal", tipe: "single", opsi: Array.from({ length: 9 }, (_, i) => ({ teks: `O${i}` })) }] }],
    ["boolean 3 opsi", { soal: [{ teks: "Soal", tipe: "boolean", opsi: [{ teks: "A" }, { teks: "B" }, { teks: "C" }] }] }],
    ["tipe tak dikenal", { soal: [{ teks: "Soal", tipe: "essay", opsi: [{ teks: "A" }, { teks: "B" }] }] }],
    ["teks opsi kosong", { soal: [{ teks: "Soal", tipe: "single", opsi: [{ teks: "" }, { teks: "B" }] }] }],
    ["bukan array", { soal: "x" }],
  ];
  for (const [nama, body] of kasus) {
    const res = await api("PUT", `/api/creator/quizzes/${quizId}/questions`, cookieSeed, body);
    report(
      `validasi soal: ${nama} → 400`,
      res.status === 400 && res.json?.error?.code === "VALIDATION_ERROR",
      `status ${res.status}, kode ${res.json?.error?.code}`,
    );
  }

  const kunciOpsiLain = await api("PUT", `/api/creator/quizzes/${quizId}/kunci`, cookieSeed, {
    question_id: soalTersimpan[0].id,
    option_id: soalTersimpan[1].opsi[0].id, // opsi milik soal lain
  });
  report(
    "kunci dengan opsi soal lain → 400",
    kunciOpsiLain.status === 400,
    `status ${kunciOpsiLain.status}, ${kunciOpsiLain.json?.error?.code ?? ""}`,
  );

  // ---------------------------------------------- kontrol akses
  const anonSimpan = await api("PUT", `/api/creator/quizzes/${quizId}/questions`, null, { soal: [] });
  report("PUT soal anon → 401", anonSimpan.status === 401, `status ${anonSimpan.status}`);

  const pemainSimpan = await api("PUT", `/api/creator/quizzes/${quizId}/questions`, cookiePemain, { soal: [] });
  report("PUT soal pemain → 403", pemainSimpan.status === 403, `status ${pemainSimpan.status}`);

  // Kreator B punya kuis sendiri
  const kuisB = await api("POST", "/api/creator/quizzes", cookieB, {
    judul: `Kuis Milik B ${stempel}`,
    durasi_detik: 300,
    kesulitan: "easy",
  });
  const quizBId = kuisB.json?.data?.id ?? null;
  const soalB = await api("PUT", `/api/creator/quizzes/${quizBId}/questions`, cookieB, {
    soal: [{ teks: "Soal milik B", tipe: "single", opsi: [{ teks: "A" }, { teks: "B" }] }],
  });
  const soalBTersimpan = soalB.json?.data?.soal?.[0] ?? null;

  const seedUtakB = await api("PUT", `/api/creator/quizzes/${quizBId}/questions`, cookieSeed, { soal: [] });
  report(
    "kreator lain menyentuh kuis B → 404",
    seedUtakB.status === 404,
    `status ${seedUtakB.status}`,
  );

  const kunciSoalB = await api("PUT", `/api/creator/quizzes/${quizId}/kunci`, cookieSeed, {
    question_id: soalBTersimpan?.id,
    option_id: soalBTersimpan?.opsi?.[0]?.id,
  });
  report(
    "kunci untuk soal di kuis lain → 404",
    kunciSoalB.status === 404,
    `status ${kunciSoalB.status}`,
  );

  // ---------------------------------------------- gambar tampil di halaman pratinjau
  const tokenRes = await api("POST", `/api/creator/quizzes/${quizId}/preview-token`, cookieSeed);
  const token = tokenRes.json?.data?.token ?? null;
  const urlPratinjau = tokenRes.json?.data?.url ?? null;
  report(
    "POST preview-token → 201 + url",
    tokenRes.status === 201 && Boolean(token) && urlPratinjau === `/pratinjau/${token}`,
    urlPratinjau ?? "",
  );

  const pratinjau = await halaman(`/pratinjau/${token}`, cookieSeed);
  const adaSemuaSoal = ["Ibu kota Indonesia?", "Borobudur terletak di Jawa Tengah.", "apa warna langit?"].every(
    (teks) => pratinjau.teks.includes(teks),
  );
  const adaOpsi = ["Jakarta", "Bandung", "Benar", "Salah", "Biru"].every((teks) => pratinjau.teks.includes(teks));
  report(
    "halaman pratinjau akurat: semua soal + opsi tampil",
    pratinjau.status === 200 && adaSemuaSoal && adaOpsi,
    `status ${pratinjau.status}, soal ${adaSemuaSoal}, opsi ${adaOpsi}`,
  );
  report(
    "halaman pratinjau menampilkan gambar soal",
    Boolean(gambarUrl) && pratinjau.teks.includes(gambarUrl),
    gambarUrl ?? "",
  );
  report(
    "halaman pratinjau: tanpa penanda kunci, dengan banner penjelasan",
    !pratinjau.teks.includes("question_keys") &&
      pratinjau.teks.includes("Kunci jawaban tidak ditampilkan di pratinjau."),
    `question_keys bocor: ${pratinjau.teks.includes("question_keys")}`,
  );

  const pratinjauNgawur = await halaman("/pratinjau/8b6221bc-ca21-4500-a0ea-4ba5a10434e7", cookieSeed);
  report("token ngawur → 404", pratinjauNgawur.status === 404, `status ${pratinjauNgawur.status}`);

  const pratinjauAnon = await halaman(`/pratinjau/${token}`, null);
  report(
    "pratinjau tanpa login dialihkan",
    pratinjauAnon.status === 307 || pratinjauAnon.status === 302,
    `status ${pratinjauAnon.status}, lokasi ${pratinjauAnon.lokasi ?? "-"}`,
  );

  // Token milik kreator B tidak bisa dipakai kreator seed.
  const tokenB = await api("POST", `/api/creator/quizzes/${quizBId}/preview-token`, cookieB);
  const tokenBNilai = tokenB.json?.data?.token ?? null;
  const pratinjauSilang = await halaman(`/pratinjau/${tokenBNilai}`, cookieSeed);
  report(
    "token milik kreator lain → 404 untuk seed",
    pratinjauSilang.status === 404,
    `status ${pratinjauSilang.status}`,
  );

  // Token kedaluwarsa.
  await fetch(`${SUPABASE_URL}/rest/v1/preview_tokens?token=eq.${token}`, {
    method: "PATCH",
    headers: serviceHeaders,
    body: JSON.stringify({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
  });
  const pratinjauKedaluwarsa = await halaman(`/pratinjau/${token}`, cookieSeed);
  report(
    "token kedaluwarsa → 404",
    pratinjauKedaluwarsa.status === 404,
    `status ${pratinjauKedaluwarsa.status}`,
  );

  // ---------------------------------------------- halaman editor
  const halamanEditor = await halaman(`/dasbor/kuis/${quizId}/soal`, cookieSeed);
  report(
    "halaman editor soal milik sendiri → 200",
    halamanEditor.status === 200 && halamanEditor.teks.includes("Editor soal"),
    `status ${halamanEditor.status}`,
  );
  const halamanEditorB = await halaman(`/dasbor/kuis/${quizBId}/soal`, cookieSeed);
  report("halaman editor kuis orang lain → 404", halamanEditorB.status === 404, `status ${halamanEditorB.status}`);

  // ---------------------------------------------- struktur terkunci setelah attempt
  await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${quizId}`, {
    method: "PATCH",
    headers: serviceHeaders,
    body: JSON.stringify({ status: "published", visibilitas: "public", published_at: new Date().toISOString() }),
  });

  const mulai = await api("POST", "/api/attempts", cookieSeed, { quiz_id: quizId });
  report("percobaan dimulai (untuk mengunci struktur)", mulai.status === 201, `status ${mulai.status}`);

  const terkunci = await api("PUT", `/api/creator/quizzes/${quizId}/questions`, cookieSeed, { soal: [] });
  report(
    "ubah struktur saat sudah dikerjakan → 409 STRUCTURE_LOCKED",
    terkunci.status === 409 && terkunci.json?.error?.code === "STRUCTURE_LOCKED",
    `status ${terkunci.status}, kode ${terkunci.json?.error?.code}`,
  );

  const kunciTerkunci = await api("PUT", `/api/creator/quizzes/${quizId}/kunci`, cookieSeed, {
    question_id: soalTersimpan[0].id,
    option_id: soalTersimpan[0].opsi[1].id,
  });
  report(
    "ubah kunci saat sudah dikerjakan → 409 STRUCTURE_LOCKED",
    kunciTerkunci.status === 409 && kunciTerkunci.json?.error?.code === "STRUCTURE_LOCKED",
    `status ${kunciTerkunci.status}, kode ${kunciTerkunci.json?.error?.code}`,
  );

  // ---------------------------------------------- bersih-bersih
  for (const id of [quizId, quizBId]) {
    if (!id) continue;
    const attempts = await fetch(`${SUPABASE_URL}/rest/v1/attempts?select=id&quiz_id=eq.${id}`, {
      headers: serviceHeaders,
    }).then((r) => r.json());
    for (const a of attempts ?? []) {
      await fetch(`${SUPABASE_URL}/rest/v1/attempt_answers?attempt_id=eq.${a.id}`, {
        method: "DELETE",
        headers: serviceHeaders,
      });
    }
    if (attempts?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/attempts?quiz_id=eq.${id}`, {
        method: "DELETE",
        headers: serviceHeaders,
      });
    }
    await fetch(`${SUPABASE_URL}/rest/v1/quizzes?id=eq.${id}`, { method: "DELETE", headers: serviceHeaders });
  }
  await hapusPengguna(idPemain);
  await hapusPengguna(idKreatorB);
  console.log("Bersih-bersih selesai.");
} catch (error) {
  report("eksekusi e2e soal", false, error instanceof Error ? error.message : String(error));
}

const gagal = results.filter((r) => !r.ok);
console.log(`\nRingkasan: ${results.length - gagal.length}/${results.length} pemeriksaan lolos.`);
if (gagal.length > 0) {
  console.error("GAGAL:", gagal.map((g) => g.name).join(", "));
  process.exit(1);
}
console.log("E2E soal LULUS.");