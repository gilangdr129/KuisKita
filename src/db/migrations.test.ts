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
