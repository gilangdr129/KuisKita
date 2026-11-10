#!/usr/bin/env node
/**
 * Verifikasi F1: memastikan migrasi F1 benar-benar teraplikasi di database.
 *
 * Jalankan:
 *   DATABASE_URL="postgresql://..." npm run db:verify
 *
 * DATABASE_URL memakai connection string langsung Supabase (Settings → Database),
 * bukan pooler, agar pg_catalog dan pg_policies dapat diperiksa.
 * Tanpa DATABASE_URL skrip ini SKIP (aman untuk pipeline lokal).
 */

import pg from "pg";

const { Client } = pg;

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.log(
    "SKIP verifikasi skema: DATABASE_URL tidak diset.\n" +
      "  Staging : isi DATABASE_URL dari Supabase (Settings → Database) lalu jalankan ulang.\n" +
      "  CLI     : npx supabase db push  (setelah 'npx supabase link --project-ref <ref>')",
  );
  process.exit(0);
}

const CHECKS_SQL = /* sql */ `
with
tables_expected(name) as (
  values ('profiles'),('categories'),('quizzes'),('questions'),('options'),
         ('question_keys'),('attempts'),('attempt_answers'),('reports'),('audit_logs')
),
indexes_expected(name) as (
  values ('quizzes_status_category_published_idx'),('quizzes_owner_idx'),
         ('questions_quiz_urutan_idx'),('attempts_active_unique'),
         ('attempts_user_started_idx'),('attempts_quiz_score_idx'),
         ('attempt_answers_attempt_idx'),('audit_logs_created_idx'),
         ('quizzes_judul_trgm_idx')
),
policies_expected(t, p) as (
  values
    ('profiles','profiles_public_read'), ('profiles','profiles_self_update'),
    ('categories','categories_public_read'),
    ('quizzes','quizzes_read'), ('quizzes','quizzes_insert'),
    ('quizzes','quizzes_update'), ('quizzes','quizzes_delete'),
    ('questions','questions_read'), ('questions','questions_write'),
    ('options','options_read'), ('options','options_write'),
    ('attempts','attempts_self_read'), ('attempts','attempts_self_insert'),
    ('attempts','attempts_self_update'),
    ('attempt_answers','answers_self_read'), ('attempt_answers','answers_self_insert'),
    ('attempt_answers','answers_self_update'),
    ('reports','reports_self_insert'), ('reports','reports_admin_read'),
    ('reports','reports_admin_update'),
    ('audit_logs','audit_admin_read')
),
triggers_expected(name) as (
  values ('on_auth_user_created'),('attempts_block_after_submit'),
         ('answers_block_after_submit'),('questions_structure_guard'),
         ('options_structure_guard'),('question_keys_structure_guard'),
         ('quizzes_delete_to_suspend')
)
select 'tabel:' || name as check_name, to_regclass('public.' || name) is not null as ok
  from tables_expected
union all
select 'indeks:' || name,
       exists (select 1 from pg_indexes i where i.schemaname = 'public' and i.indexname = name)
  from indexes_expected
union all
select 'rls:' || c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in (select name from tables_expected)
union all
select 'policy:' || t || '.' || p,
       exists (
         select 1 from pg_policies g
         where g.schemaname = 'public' and g.tablename = t and g.policyname = p
       )
  from policies_expected
union all
select 'trigger:' || name,
       exists (
         select 1 from pg_trigger tg
         join pg_class c on c.oid = tg.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
         where not tg.tgisinternal and tg.tgname = name
       )
  from triggers_expected
union all
select 'question_keys: tanpa policy klien',
       not exists (select 1 from pg_policies g where g.schemaname = 'public' and g.tablename = 'question_keys')
union all
select 'grant: authenticated select kolom profiles.id',
       has_column_privilege('authenticated', 'public.profiles', 'id', 'select')
union all
select 'grant: anon tanpa select question_keys',
       not has_table_privilege('anon', 'public.question_keys', 'select')
union all
select 'grant: authenticated tanpa select question_keys',
       not has_table_privilege('authenticated', 'public.question_keys', 'select')
union all
select 'grant: authenticated tanpa update kolom attempt_answers.benar',
       not has_column_privilege('authenticated', 'public.attempt_answers', 'benar', 'update')
union all
select 'grant: authenticated tanpa update kolom profiles.role',
       not has_column_privilege('authenticated', 'public.profiles', 'role', 'update')
union all
select 'grant: authenticated tanpa insert attempts',
       not has_table_privilege('authenticated', 'public.attempts', 'insert')
union all
select 'grant: authenticated tanpa update attempts',
       not has_table_privilege('authenticated', 'public.attempts', 'update')
union all
select 'grant: authenticated tanpa insert attempt_answers',
       not has_table_privilege('authenticated', 'public.attempt_answers', 'insert')
union all
select 'grant: authenticated tanpa update attempt_answers',
       not has_table_privilege('authenticated', 'public.attempt_answers', 'update')
union all
select 'constraint: question_keys PK (question_id)',
       exists (
         select 1 from pg_constraint con
         join pg_class c on c.oid = con.conrelid
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'question_keys' and con.contype = 'p'
           and con.conkey = array[(select attnum from pg_attribute
                                   where attrelid = c.oid and attname = 'question_id')]
       )
union all
select 'ekstensi: pg_trgm aktif',
       exists (select 1 from pg_extension where extname = 'pg_trgm')
union all
select 'seed: minimal 10 kategori terisi',
       (select count(*) from public.categories) >= 10
order by check_name;
`;

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const result = await client.query(CHECKS_SQL);

  const rows = result.rows.map((row) => ({ check: row.check_name, ok: row.ok === true }));
  const failed = rows.filter((row) => !row.ok);

  for (const row of rows) {
    console.log(`${row.ok ? "PASS" : "FAIL"}  ${row.check}`);
  }

  if (failed.length > 0) {
    console.error(`\nVerifikasi skema GAGAL: ${failed.length} pemeriksaan tidak lolos.`);
    process.exit(1);
  }

  console.log(`\nVerifikasi skema LULUS: ${rows.length} pemeriksaan lolos.`);
} catch (error) {
  console.error("Verifikasi skema ERROR:", error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}
