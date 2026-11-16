-- KuisKita F13 · Migrasi 16: editor soal/opsi + kunci server-only + pratinjau
-- Bergantung pada: 20261109020001_schema.sql, 20261109020002_triggers.sql
--
-- Kunci jawaban (question_keys) tidak punya policy/grant klien: satu-satunya
-- penulisnya fungsi SECURITY DEFINER di bawah, dipanggil Route Handler lewat
-- service role setelah sesi & kepemilikan diverifikasi. Endpoint editor
-- mengembalikan kunci milik pemilik sebagai "opsi_benar_id" — bukan tabel
-- question_keys — sehingga tabel kunci tak pernah bocor ke payload apa pun.

-- ============================================================
-- 1) Kunci hanya boleh menunjuk opsi milik soal yang sama.
--    Pertahanan berlapis di samping validasi RPC/API.
-- ============================================================
create or replace function public.guard_question_keys_match()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1
      from public.options o
     where o.id = new.option_id
       and o.question_id = new.question_id
  ) then
    raise exception 'OPTION_NOT_IN_QUESTION: opsi bukan milik soal ini'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists question_keys_option_match on public.question_keys;
create trigger question_keys_option_match
  before insert or update on public.question_keys
  for each row execute function public.guard_question_keys_match();

-- ============================================================
-- 2) simpan_soal_kuis: ganti seluruh struktur soal+opsi milik kuis.
--    Urutan diambil dari posisi array (editor mengurutkan via tombol
--    naik/turun); hapus lama ikut menghapus opsi & kunci lewat cascade.
-- ============================================================
create or replace function public.simpan_soal_kuis(
  p_user_id uuid,
  p_quiz_id uuid,
  p_soal jsonb
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_quiz      public.quizzes%rowtype;
  v_item      jsonb;
  v_opsi      jsonb;
  v_opsi_item jsonb;
  v_opsi_id   uuid;
  v_soal_id   uuid;
  v_urutan    integer := 0;
  v_urut_opsi integer;
  v_hasil     jsonb := '[]'::jsonb;
  v_opsi_json jsonb;
begin
  select * into v_quiz
    from public.quizzes
   where id = p_quiz_id and owner_id = p_user_id;
  if not found then
    raise exception 'QUIZ_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Struktur terkunci setelah ada percobaan: versi baru = duplikasi (D4/F14).
  if exists (select 1 from public.attempts a where a.quiz_id = p_quiz_id) then
    raise exception 'STRUCTURE_LOCKED: struktur kuis sudah dikerjakan' using errcode = 'P0001';
  end if;

  if p_soal is null or jsonb_typeof(p_soal) <> 'array' then
    raise exception 'SOAL_INVALID' using errcode = 'P0001';
  end if;

  if jsonb_array_length(p_soal) > 100 then
    raise exception 'SOAL_TERLALU_BANYAK: maksimal 100 soal per kuis' using errcode = 'P0001';
  end if;

  delete from public.questions where quiz_id = p_quiz_id;

  for v_item in select * from jsonb_array_elements(p_soal) loop
    v_urutan := v_urutan + 1;
    v_opsi := v_item -> 'opsi';

    if v_opsi is null or jsonb_typeof(v_opsi) <> 'array' then
      raise exception 'OPSI_INVALID' using errcode = 'P0001';
    end if;

    if jsonb_array_length(v_opsi) < 2 then
      raise exception 'OPSI_KURANG: setiap soal minimal 2 opsi' using errcode = 'P0001';
    end if;

    if jsonb_array_length(v_opsi) > 8 then
      raise exception 'OPSI_TERLALU_BANYAK: maksimal 8 opsi per soal' using errcode = 'P0001';
    end if;

    if (v_item ->> 'tipe') = 'boolean' and jsonb_array_length(v_opsi) <> 2 then
      raise exception 'OPSI_BOOLEAN: soal benar/salah harus punya tepat 2 opsi'
        using errcode = 'P0001';
    end if;

    insert into public.questions (quiz_id, teks, tipe, bobot, urutan, pembahasan, gambar_url)
    values (
      p_quiz_id,
      v_item ->> 'teks',
      coalesce(v_item ->> 'tipe', 'single'),
      coalesce((v_item ->> 'bobot')::numeric, 1),
      v_urutan,
      coalesce(v_item ->> 'pembahasan', ''),
      v_item ->> 'gambar_url'
    )
    returning id into v_soal_id;

    v_urut_opsi := 0;
    v_opsi_json := '[]'::jsonb;

    for v_opsi_item in select * from jsonb_array_elements(v_opsi) loop
      v_urut_opsi := v_urut_opsi + 1;

      insert into public.options (question_id, teks, urutan)
      values (v_soal_id, v_opsi_item ->> 'teks', v_urut_opsi)
      returning id into v_opsi_id;

      v_opsi_json := v_opsi_json || jsonb_build_object(
        'id', v_opsi_id,
        'urutan', v_urut_opsi
      );
    end loop;

    v_hasil := v_hasil || jsonb_build_object(
      'id', v_soal_id,
      'urutan', v_urutan,
      'opsi', v_opsi_json
    );
  end loop;

  return jsonb_build_object('soal', v_hasil, 'jumlah', v_urutan);
end $$;

-- ============================================================
-- 3) simpan_kunci_jawaban: satu kunci per soal (PK question_id).
--    Opsi harus milik soal yang sama; upsert aman untuk ganti kunci.
-- ============================================================
create or replace function public.simpan_kunci_jawaban(
  p_user_id uuid,
  p_question_id uuid,
  p_option_id uuid
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_question public.questions%rowtype;
begin
  select * into v_question from public.questions where id = p_question_id;
  if not found then
    raise exception 'QUESTION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.quizzes q
     where q.id = v_question.quiz_id and q.owner_id = p_user_id
  ) then
    raise exception 'QUIZ_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.attempts a where a.quiz_id = v_question.quiz_id) then
    raise exception 'STRUCTURE_LOCKED: struktur kuis sudah dikerjakan' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.options o
     where o.id = p_option_id and o.question_id = p_question_id
  ) then
    raise exception 'OPTION_MISMATCH: opsi bukan milik soal ini' using errcode = 'P0001';
  end if;

  insert into public.question_keys (question_id, option_id)
  values (p_question_id, p_option_id)
  on conflict (question_id) do update set option_id = excluded.option_id;

  return jsonb_build_object(
    'question_id', p_question_id,
    'option_id', p_option_id,
    'tersimpan', true
  );
end $$;

-- ============================================================
-- 4) Pratinjau draft: token berguna 30 menit, terikat kuis + pemilik.
--    Tanpa policy/grant klien — hanya service_role.
-- ============================================================
create table if not exists public.preview_tokens (
  token      uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references public.quizzes(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists preview_tokens_quiz_idx
  on public.preview_tokens (quiz_id, created_at desc);

alter table public.preview_tokens enable row level security;
revoke all on table public.preview_tokens from anon, authenticated;

comment on table public.preview_tokens is
  'Token pratinjau draft; hanya service_role yang boleh membaca/menulis.';

create or replace function public.buat_token_pratinjau(p_user_id uuid, p_quiz_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_token uuid;
begin
  if not exists (
    select 1 from public.quizzes q
     where q.id = p_quiz_id and q.owner_id = p_user_id
  ) then
    raise exception 'QUIZ_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Satu token aktif per kuis+pemilik: yang lama dibuang.
  delete from public.preview_tokens
   where quiz_id = p_quiz_id and user_id = p_user_id;

  insert into public.preview_tokens (quiz_id, user_id, expires_at)
  values (p_quiz_id, p_user_id, now() + interval '30 minutes')
  returning token into v_token;

  return jsonb_build_object(
    'token', v_token,
    'kedaluwarsa', now() + interval '30 minutes'
  );
end $$;

create or replace function public.pakai_token_pratinjau(p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_baris public.preview_tokens%rowtype;
begin
  select * into v_baris from public.preview_tokens where token = p_token;
  if not found then
    raise exception 'PREVIEW_TOKEN_INVALID' using errcode = 'P0001';
  end if;

  if v_baris.expires_at <= now() then
    delete from public.preview_tokens where token = p_token;
    raise exception 'PREVIEW_TOKEN_INVALID: token sudah kedaluwarsa' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'quiz_id', v_baris.quiz_id,
    'user_id', v_baris.user_id,
    'kedaluwarsa', v_baris.expires_at
  );
end $$;

-- ============================================================
-- PostgREST tidak boleh memanggil RPC editor secara langsung.
-- ============================================================
revoke execute on function public.simpan_soal_kuis(uuid, uuid, jsonb) from anon, authenticated, public;
revoke execute on function public.simpan_kunci_jawaban(uuid, uuid, uuid) from anon, authenticated, public;
revoke execute on function public.buat_token_pratinjau(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.pakai_token_pratinjau(uuid) from anon, authenticated, public;