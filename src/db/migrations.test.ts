import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Tes integritas berkas migrasi F1. Verifikasi runtime (tabel/indeks/policy
 * benar-benar ada di database) dijalankan terpisah lewat
 * `npm run db:verify` dengan DATABASE_URL; tes ini menjaga konsistensi
 * penulisan SQL di CI tanpa akses database.
 */

const migrationsDir = path.resolve(import.meta.dirname, "../../supabase/migrations");

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const sql = files.map((name) => readFileSync(path.join(migrationsDir, name), "utf8")).join("\n");

const TABLES = [
  "profiles",
  "categories",
  "quizzes",
  "questions",
  "options",
  "question_keys",
  "attempts",
  "attempt_answers",
  "reports",
  "audit_logs",
];

const INDEXES = [
  "quizzes_status_category_published_idx",
  "quizzes_owner_idx",
  "questions_quiz_urutan_idx",
  "attempts_active_unique",
  "attempts_user_started_idx",
  "attempts_quiz_score_idx",
  "attempt_answers_attempt_idx",
  "audit_logs_created_idx",
  "quizzes_judul_trgm_idx",
];

const TRIGGERS = [
  "on_auth_user_created",
  "attempts_block_after_submit",
  "answers_block_after_submit",
  "questions_structure_guard",
  "options_structure_guard",
  "question_keys_structure_guard",
  "quizzes_delete_to_suspend",
];

describe("migrasi F1", () => {
  it("memuat berkas migrasi F1-F4 berurutan", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files[0]).toContain("schema");
    expect(files[1]).toContain("triggers");
    expect(files[2]).toContain("seed_categories");
    expect(files.some((name) => name.includes("username_from_metadata"))).toBe(true);
    expect(files.some((name) => name.includes("oauth_username"))).toBe(true);
    expect(files.some((name) => name.includes("storage_media_bucket"))).toBe(true);
  });

  it("membuat seluruh 10 tabel", () => {
    for (const table of TABLES) {
      expect(sql, `tabel ${table}`).toContain(`create table if not exists public.${table} (`);
    }
  });

  it("mengaktifkan RLS untuk semua tabel", () => {
    for (const table of TABLES) {
      expect(
        new RegExp(`alter table public\\.${table}\\s+enable row level security`).test(sql),
        `RLS ${table}`,
      ).toBe(true);
    }
  });

  it("memuat seluruh indeks wajib", () => {
    for (const index of INDEXES) {
      expect(
        new RegExp(`create (?:unique )?index if not exists ${index}\\b`).test(sql),
        `indeks ${index}`,
      ).toBe(true);
    }
  });

  it("membuat seluruh trigger wajib", () => {
    for (const trigger of TRIGGERS) {
      expect(sql, `trigger ${trigger}`).toContain(`create trigger ${trigger}`);
    }
  });

  it("tidak memberi policy maupun grant klien pada question_keys", () => {
    const keysSection = sql.slice(sql.indexOf("create table if not exists public.question_keys"));
    const nextTable = keysSection.indexOf("create table if not exists", 10);
    const scope = nextTable === -1 ? keysSection : keysSection.slice(0, nextTable);
    expect(scope).not.toContain("create policy");

    expect(sql).not.toContain("grant select on public.question_keys");
    expect(sql).not.toContain("grant select, insert, update, delete on public.question_keys");
  });

  it("tidak memberi hak update kolom kritis lewat grant klien", () => {
    expect(sql).not.toContain("grant update on public.attempt_answers");
    expect(sql).not.toContain("grant update on public.profiles");
    expect(sql).not.toContain("grant update on public.attempts (skor");
  });

  it("membatasi klien ke SELECT pada attempts dan attempt_answers", () => {
    expect(sql).toContain("grant select on public.attempts to authenticated;");
    expect(sql).toContain("grant select on public.attempt_answers to authenticated;");
    expect(sql).not.toContain("grant insert, update on public.attempts");
    expect(sql).not.toContain("grant insert, update on public.attempt_answers");
  });

  it("mencabut hak default sebelum memberi grant ke klien", () => {
    const start = sql.indexOf("revoke all on table public.");
    const end = sql.indexOf("from anon, authenticated;", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const revokeStatement = sql.slice(start, end);
    for (const table of TABLES) {
      expect(revokeStatement, `revoke ${table}`).toContain(`public.${table}`);
    }
    expect(sql).toContain(
      "alter default privileges in schema public revoke all on tables from anon, authenticated",
    );
  });

  it("guard struktur memakai quiz_id (bukan id soal) saat resolve induk", () => {
    expect(sql).not.toContain("select q.id into v_quiz_id");
    expect(sql.match(/select q\.quiz_id into v_quiz_id/g) ?? []).toHaveLength(4);
  });

  it("guard struktur melonggarkan diri saat dijalankan oleh cascade FK", () => {
    const guards = [
      "guard_questions_structure",
      "guard_options_structure",
      "guard_question_keys_structure",
      "quizzes_delete_to_suspend",
    ];
    for (const guard of guards) {
      const at = sql.indexOf(`function public.${guard}()`);
      expect(at, `fungsi ${guard}`).toBeGreaterThan(-1);
      const body = sql.slice(at, sql.indexOf("$$;", at));
      expect(body, `pg_trigger_depth di ${guard}`).toContain("pg_trigger_depth()");
    }
  });

  it("menyemai 10 kategori", () => {
    const seed = sql.slice(sql.indexOf("insert into public.categories"));
    const tuples = seed.match(/\('[^']+',\s*'[^']+'\)/g) ?? [];
    expect(tuples).toHaveLength(10);
  });

  it("semua foreign key menunjuk tabel yang dibuat di migrasi ini", () => {
    const referenced = [...sql.matchAll(/references\s+public\.([a-z_]+)\s*\(/g)].map((m) => m[1]);
    for (const table of new Set(referenced)) {
      if (table === "users") continue; // skema auth milik Supabase
      expect(TABLES, `referensi ke public.${table}`).toContain(table);
    }
  });
});

describe("migrasi F13 (editor soal + kunci server-only + pratinjau)", () => {
  /** Signature RPC ditulis multi-baris → bandingkan tanpa whitespace. */
  const sqlPadat = sql.replace(/\s+/g, "");

  it("punya berkas migrasi editor soal", () => {
    expect(files.some((name) => name.includes("editor_soal"))).toBe(true);
  });

  it("membuat RPC editor & mencabut EXECUTE dari anon/authenticated/public", () => {
    const rpc = [
      {
        tandaTangan: "public.simpan_soal_kuis(p_user_iduuid,p_quiz_iduuid,p_soaljsonb)",
        revoke: "public.simpan_soal_kuis(uuid,uuid,jsonb)",
      },
      {
        tandaTangan: "public.simpan_kunci_jawaban(p_user_iduuid,p_question_iduuid,p_option_iduuid)",
        revoke: "public.simpan_kunci_jawaban(uuid,uuid,uuid)",
      },
      {
        tandaTangan: "public.buat_token_pratinjau(p_user_iduuid,p_quiz_iduuid)",
        revoke: "public.buat_token_pratinjau(uuid,uuid)",
      },
      {
        tandaTangan: "public.pakai_token_pratinjau(p_tokenuuid)",
        revoke: "public.pakai_token_pratinjau(uuid)",
      },
    ];
    for (const { tandaTangan, revoke } of rpc) {
      expect(sqlPadat, `RPC ${tandaTangan}`).toContain(
        `createorreplacefunction${tandaTangan}`,
      );
      expect(sqlPadat, `revoke ${revoke}`).toContain(
        `revokeexecuteonfunction${revoke}fromanon,authenticated,public;`,
      );
    }
  });

  it("RPC penerbitan soal memeriksa kepemilikan & struktur terkunci", () => {
    const simpan = sql.slice(sql.indexOf("function public.simpan_soal_kuis"));
    const badan = simpan.slice(0, simpan.indexOf("$$;"));
    expect(badan).toContain("owner_id = p_user_id");
    expect(badan).toContain("raise exception 'STRUCTURE_LOCKED");
    expect(badan).toContain("raise exception 'OPSI_TERLALU_BANYAK");
  });

  it("RPC kunci hanya menerima opsi milik soal yang sama", () => {
    const kunci = sql.slice(sql.indexOf("function public.simpan_kunci_jawaban"));
    const badan = kunci.slice(0, kunci.indexOf("$$;"));
    expect(badan).toContain("and o.question_id = p_question_id");
    expect(badan).toContain("raise exception 'OPTION_MISMATCH");
    expect(badan).toContain("insert into public.question_keys");
  });

  it("trigger question_keys_option_match menjaga opsi milik soal", () => {
    expect(sql).toContain("create trigger question_keys_option_match");
    const fn = sql.slice(sql.indexOf("function public.guard_question_keys_match()"));
    expect(fn.slice(0, fn.indexOf("$$;"))).toContain("and o.question_id = new.question_id");
  });

  it("preview_tokens tanpa policy & tanpa grant klien", () => {
    expect(sql).toContain("create table if not exists public.preview_tokens");
    expect(sql).toContain("revoke all on table public.preview_tokens from anon, authenticated");

    const awal = sql.indexOf("create table if not exists public.preview_tokens");
    const akhir = sql.indexOf("create or replace function public.buat_token_pratinjau", awal);
    expect(awal).toBeGreaterThan(-1);
    expect(akhir).toBeGreaterThan(awal);
    expect(sql.slice(awal, akhir)).not.toContain("create policy");
    expect(sql).not.toContain("grant select on public.preview_tokens");
  });

  it("token pratinjau terbatas 30 menit dan terikat pemilik", () => {
    expect(sql).toContain("now() + interval '30 minutes'");
    expect(sql).toContain("and q.owner_id = p_user_id");
  });
});
