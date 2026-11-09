-- KuisKita F1 · Migrasi 1: ekstensi, tabel, constraint, indeks, fungsi helper, RLS
-- Bergelantung: tidak ada (migrasi pertama).

-- ============================================================
-- Ekstensi
-- ============================================================
-- gen_random_uuid() sudah bawaan PostgreSQL 13+ (pgcrypto tidak diperlukan).
-- pg_trgm dipasang di skema `extensions` sesuai konvensi Supabase agar
-- fungsinya tidak terekspos di skema public yang dibuka Data API.
create extension if not exists pg_trgm with schema extensions; -- pencarian judul (F11)

-- ============================================================
-- profiles (1:1 dengan auth.users)
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique check (username ~ '^[a-z0-9_.]{3,20}$'),
  avatar_url  text,
  role        text not null default 'player' check (role in ('player', 'creator', 'admin')),
  created_at  timestamptz not null default now()
);

comment on table public.profiles is 'Profil publik pengguna; role hanya boleh diubah lewat server/admin.';

-- ============================================================
-- categories
-- ============================================================
create table if not exists public.categories (
  id    bigint generated always as identity primary key,
  nama  text not null,
  slug  text not null unique
);

-- ============================================================
-- quizzes
-- ============================================================
create table if not exists public.quizzes (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  judul          text not null check (char_length(judul) between 3 and 120),
  deskripsi      text not null default '' check (char_length(deskripsi) <= 2000),
  category_id    bigint references public.categories(id),
  kesulitan      text not null default 'medium' check (kesulitan in ('easy', 'medium', 'hard')),
  durasi_detik   integer not null check (durasi_detik > 0),
  status         text not null default 'draft' check (status in ('draft', 'published', 'suspended')),
  visibilitas    text not null default 'public' check (visibilitas in ('public', 'unlisted', 'private')),
  acak_soal      boolean not null default false,
  acak_opsi      boolean not null default false,
  maks_percobaan integer check (maks_percobaan is null or maks_percobaan > 0),
  created_at     timestamptz not null default now(),
  published_at   timestamptz
);

create index if not exists quizzes_status_category_published_idx
  on public.quizzes (status, category_id, published_at desc);
create index if not exists quizzes_owner_idx
  on public.quizzes (owner_id, created_at desc);
create index if not exists quizzes_judul_trgm_idx
  on public.quizzes using gin (judul extensions.gin_trgm_ops); -- pencarian judul (F11)

-- ============================================================
-- questions
-- ============================================================
create table if not exists public.questions (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.quizzes(id) on delete cascade,
  teks        text not null check (char_length(teks) between 1 and 1000),
  tipe        text not null default 'single' check (tipe in ('single', 'boolean')),
  gambar_url  text,
  bobot       numeric(6, 2) not null default 1 check (bobot >= 0),
  urutan      integer not null check (urutan >= 0),
  pembahasan  text not null default '',
  unique (quiz_id, urutan)
);

create index if not exists questions_quiz_urutan_idx
  on public.questions (quiz_id, urutan);

-- ============================================================
-- options
-- ============================================================
create table if not exists public.options (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.questions(id) on delete cascade,
  teks         text not null check (char_length(teks) between 1 and 500),
  urutan       integer not null check (urutan >= 0),
  unique (question_id, urutan)
);

-- ============================================================
-- question_keys — kunci jawaban. TIDAK dapat diakses klien (tanpa policy RLS).
-- PK (question_id) menegakkan "tepat satu jawaban benar" per soal.
-- ============================================================
create table if not exists public.question_keys (
  question_id  uuid primary key references public.questions(id) on delete cascade,
  option_id    uuid not null unique references public.options(id) on delete cascade
);

-- ============================================================
-- attempts
-- ============================================================
create table if not exists public.attempts (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  started_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  submitted_at  timestamptz,
  skor          numeric(6, 2),
  persentase    numeric(5, 2),
  durasi_ms     integer,
  status        text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'expired')),
  acak          jsonb not null default '{}'::jsonb,
  constraint attempts_expiry_after_start check (expires_at > started_at)
);

-- Satu attempt in_progress per pengguna per kuis (PRD §13).
create unique index if not exists attempts_active_unique
  on public.attempts (quiz_id, user_id) where status = 'in_progress';
create index if not exists attempts_user_started_idx
  on public.attempts (user_id, started_at desc);
create index if not exists attempts_quiz_score_idx
  on public.attempts (quiz_id, skor desc nulls last, durasi_ms asc nulls last);

-- ============================================================
-- attempt_answers
-- ============================================================
create table if not exists public.attempt_answers (
  attempt_id   uuid not null references public.attempts(id) on delete cascade,
  question_id  uuid not null references public.questions(id) on delete cascade,
  option_id    uuid not null references public.options(id) on delete cascade,
  benar        boolean,
  answered_at  timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

create index if not exists attempt_answers_attempt_idx
  on public.attempt_answers (attempt_id);

-- ============================================================
-- reports (laporan konten, F17 opsional)
-- ============================================================
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references public.quizzes(id) on delete cascade,
  reporter_id  uuid not null references public.profiles(id) on delete cascade,
  alasan       text not null check (char_length(alasan) between 1 and 1000),
  status       text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at   timestamptz not null default now()
);

-- ============================================================
-- audit_logs (tindakan admin)
-- ============================================================
create table if not exists public.audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles(id) on delete set null,
  aksi         text not null,
  target_type  text not null,
  target_id    text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists audit_logs_created_idx
  on public.audit_logs (created_at desc);

-- ============================================================
-- Fungsi helper (dipakai policy RLS)
-- ============================================================
create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
$$;

create or replace function public.is_creator() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('creator', 'admin')
  )
$$;

-- ============================================================
-- RLS: aktifkan di semua tabel
-- ============================================================
alter table public.profiles        enable row level security;
alter table public.categories      enable row level security;
alter table public.quizzes         enable row level security;
alter table public.questions       enable row level security;
alter table public.options         enable row level security;
alter table public.question_keys   enable row level security;
alter table public.attempts        enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.reports         enable row level security;
alter table public.audit_logs      enable row level security;

-- ============================================================
-- RLS: grants peran
-- ============================================================
-- Supabase memberi default privileges penuh pada tabel baru di skema public
-- untuk anon/authenticated. Cabut lebih dulu agar posture keamanan
-- deterministik (tidak bergantung lingkungan), lalu beri hak minimum.
revoke all on table public.profiles, public.categories, public.quizzes,
  public.questions, public.options, public.question_keys, public.attempts,
  public.attempt_answers, public.reports, public.audit_logs
  from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select (username, avatar_url) on public.profiles to anon, authenticated;
grant update (username, avatar_url) on public.profiles to authenticated;

grant select on public.categories to anon, authenticated;

grant select on public.quizzes to anon, authenticated;
grant insert, update, delete on public.quizzes to authenticated;

grant select on public.questions to anon, authenticated;
grant insert, update, delete on public.questions to authenticated;

grant select on public.options to anon, authenticated;
grant insert, update, delete on public.options to authenticated;

-- question_keys: TIDAK ADA grant untuk anon/authenticated.
-- Hanya service_role (bypassrls) dan fungsi SECURITY DEFINER milik server.

-- Catatan anti-curang: percobaan & jawaban HANYA ditulis lewat server
-- (service role atau RPC submit_attempt). Klien hanya berhak SELECT, sehingga
-- expires_at, status, skor, dan attempt_answers.benar tidak dapat dimanipulasi
-- lewat PostgREST memakai anon key + JWT pengguna. Policy insert/update di
-- bawah tetap ada sebagai pertahanan berlapis jika grant dibuka kembali.
grant select on public.attempts to authenticated;
grant select on public.attempt_answers to authenticated;
grant select, insert, update on public.reports to authenticated;

-- ============================================================
-- RLS: policies
-- ============================================================

-- profiles: baca publik terbatas kolom; ubah hanya milik sendiri.
drop policy if exists profiles_public_read on public.profiles;
create policy profiles_public_read on public.profiles
  for select using (true);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- categories: baca publik; tulis hanya server/service role.
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
  for select using (true);

-- quizzes
drop policy if exists quizzes_read on public.quizzes;
create policy quizzes_read on public.quizzes
  for select using (
    (status = 'published' and visibilitas = 'public')
    or owner_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists quizzes_insert on public.quizzes;
create policy quizzes_insert on public.quizzes
  for insert to authenticated
  with check (owner_id = auth.uid() and public.is_creator());

drop policy if exists quizzes_update on public.quizzes;
create policy quizzes_update on public.quizzes
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists quizzes_delete on public.quizzes;
create policy quizzes_delete on public.quizzes
  for delete to authenticated
  using (owner_id = auth.uid());

-- questions
drop policy if exists questions_read on public.questions;
create policy questions_read on public.questions
  for select using (
    exists (
      select 1 from public.quizzes q
      where q.id = questions.quiz_id
        and ((q.status = 'published' and q.visibilitas = 'public')
          or q.owner_id = auth.uid()
          or public.is_admin())
    )
  );

drop policy if exists questions_write on public.questions;
create policy questions_write on public.questions
  for all to authenticated
  using (
    exists (select 1 from public.quizzes q where q.id = questions.quiz_id and q.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.quizzes q where q.id = questions.quiz_id and q.owner_id = auth.uid())
  );

-- options
drop policy if exists options_read on public.options;
create policy options_read on public.options
  for select using (
    exists (
      select 1 from public.questions qs
      join public.quizzes q on q.id = qs.quiz_id
      where qs.id = options.question_id
        and ((q.status = 'published' and q.visibilitas = 'public')
          or q.owner_id = auth.uid()
          or public.is_admin())
    )
  );

drop policy if exists options_write on public.options;
create policy options_write on public.options
  for all to authenticated
  using (
    exists (
      select 1 from public.questions qs
      join public.quizzes q on q.id = qs.quiz_id
      where qs.id = options.question_id and q.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.questions qs
      join public.quizzes q on q.id = qs.quiz_id
      where qs.id = options.question_id and q.owner_id = auth.uid()
    )
  );

-- question_keys: TIDAK ADA POLICY. RLS aktif + tidak ada policy = tolak semua
-- peran non-bypass (anon, authenticated). Kunci hanya dibaca service_role/RPC.

-- attempts
drop policy if exists attempts_self_read on public.attempts;
create policy attempts_self_read on public.attempts
  for select using (user_id = auth.uid());

drop policy if exists attempts_self_insert on public.attempts;
create policy attempts_self_insert on public.attempts
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'in_progress' and expires_at > now());

drop policy if exists attempts_self_update on public.attempts;
create policy attempts_self_update on public.attempts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- attempt_answers
drop policy if exists answers_self_read on public.attempt_answers;
create policy answers_self_read on public.attempt_answers
  for select using (
    exists (select 1 from public.attempts a where a.id = attempt_answers.attempt_id and a.user_id = auth.uid())
  );

drop policy if exists answers_self_insert on public.attempt_answers;
create policy answers_self_insert on public.attempt_answers
  for insert to authenticated
  with check (
    exists (select 1 from public.attempts a where a.id = attempt_answers.attempt_id and a.user_id = auth.uid())
  );

drop policy if exists answers_self_update on public.attempt_answers;
create policy answers_self_update on public.attempt_answers
  for update to authenticated
  using (
    exists (select 1 from public.attempts a where a.id = attempt_answers.attempt_id and a.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.attempts a where a.id = attempt_answers.attempt_id and a.user_id = auth.uid())
  );

-- reports
drop policy if exists reports_self_insert on public.reports;
create policy reports_self_insert on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists reports_admin_read on public.reports;
create policy reports_admin_read on public.reports
  for select using (public.is_admin());

drop policy if exists reports_admin_update on public.reports;
create policy reports_admin_update on public.reports
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- audit_logs: baca admin; tulis hanya lewat service role (tanpa policy insert).
drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs
  for select using (public.is_admin());
