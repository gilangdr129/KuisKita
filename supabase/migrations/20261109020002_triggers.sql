-- KuisKita F1 · Migrasi 2: trigger & fungsi trigger
-- Bergelantung pada: 20261109020001_schema.sql

-- ============================================================
-- 1) Profil otomatis saat pengguna baru dibuat di auth.users
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'user_' || substr(replace(new.id::text, '-', ''), 1, 10));
  return new;
exception
  when unique_violation then
    -- Tabrakan username (sangat jarang): coba sekali lagi dengan sufiks acak.
    insert into public.profiles (id, username)
    values (new.id, 'user_' || substr(replace(new.id::text, '-', ''), 1, 8) || '_' || substr(gen_random_uuid()::text, 1, 4));
    return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2) attempts tidak dapat diubah setelah submit (skor final)
--    RPC submit_attempt (F9) yang pertama kali mengisi submitted_at;
--    trigger ini mengunci perubahan setelahnya.
-- ============================================================
create or replace function public.enforce_attempt_immutability()
returns trigger language plpgsql as $$
begin
  if old.submitted_at is not null then
    raise exception 'attempt sudah final dan tidak dapat diubah'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists attempts_block_after_submit on public.attempts;
create trigger attempts_block_after_submit
  before update on public.attempts
  for each row execute function public.enforce_attempt_immutability();

-- ============================================================
-- 3) attempt_answers tidak dapat diubah setelah attempt di-submit.
--    Catatan urutan (penting untuk F9): RPC submit_attempt harus
--    meng-update attempt_answers.benar LEBIH DULU, lalu meng-update
--    attempts (mengisi submitted_at) di akhir transaksi.
-- ============================================================
create or replace function public.enforce_answers_after_submit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_submitted_at timestamptz;
begin
  if tg_op = 'DELETE' then
    select a.submitted_at into v_submitted_at from public.attempts a where a.id = old.attempt_id;
  else
    select a.submitted_at into v_submitted_at from public.attempts a where a.id = new.attempt_id;
  end if;

  if v_submitted_at is not null then
    raise exception 'jawaban tidak dapat diubah setelah attempt di-submit'
      using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists answers_block_after_submit on public.attempt_answers;
create trigger answers_block_after_submit
  before insert or update or delete on public.attempt_answers
  for each row execute function public.enforce_answers_after_submit();

-- ============================================================
-- 4) Struktur soal/opsi/kunci terkunci setelah kuis punya percobaan (D4).
--    Versi baru = duplikasi kuis (F14).
-- ============================================================
create or replace function public.assert_quiz_structure_editable(p_quiz_id uuid)
returns void language plpgsql as $$
begin
  if exists (select 1 from public.attempts a where a.quiz_id = p_quiz_id) then
    raise exception 'struktur kuis sudah dikerjakan; buat duplikat untuk versi baru (lihat F14)'
      using errcode = 'P0001';
  end if;
end $$;

create or replace function public.guard_questions_structure()
returns trigger language plpgsql as $$
declare
  v_quiz_id uuid;
begin
  -- Penghapusan via FK cascade (mis. hapus kuis) tidak perlu dijaga lagi.
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_quiz_id := old.quiz_id;
  else
    v_quiz_id := new.quiz_id;
  end if;

  perform public.assert_quiz_structure_editable(v_quiz_id);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists questions_structure_guard on public.questions;
create trigger questions_structure_guard
  before insert or update or delete on public.questions
  for each row execute function public.guard_questions_structure();

create or replace function public.guard_options_structure()
returns trigger language plpgsql as $$
declare
  v_quiz_id uuid;
begin
  -- Penghapusan via FK cascade (induk soal sudah tidak ada) tidak perlu dijaga.
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    select q.quiz_id into v_quiz_id from public.questions q where q.id = old.question_id;
  else
    select q.quiz_id into v_quiz_id from public.questions q where q.id = new.question_id;
  end if;

  -- Induk sudah terhapus (mis. hapus manual di urutan tak lazim): biarkan.
  if v_quiz_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  perform public.assert_quiz_structure_editable(v_quiz_id);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists options_structure_guard on public.options;
create trigger options_structure_guard
  before insert or update or delete on public.options
  for each row execute function public.guard_options_structure();

create or replace function public.guard_question_keys_structure()
returns trigger language plpgsql as $$
declare
  v_quiz_id uuid;
begin
  -- Penghapusan via FK cascade (induk soal sudah tidak ada) tidak perlu dijaga.
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    select q.quiz_id into v_quiz_id from public.questions q where q.id = old.question_id;
  else
    select q.quiz_id into v_quiz_id from public.questions q where q.id = new.question_id;
  end if;

  -- Induk sudah terhapus (mis. hapus manual di urutan tak lazim): biarkan.
  if v_quiz_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  perform public.assert_quiz_structure_editable(v_quiz_id);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

drop trigger if exists question_keys_structure_guard on public.question_keys;
create trigger question_keys_structure_guard
  before insert or update or delete on public.question_keys
  for each row execute function public.guard_question_keys_structure();

-- ============================================================
-- 5) Hapus kuis yang sudah punya percobaan => transisi ke suspended
--    (bukan hard delete). Return NULL melewati operasi DELETE.
-- ============================================================
create or replace function public.quizzes_delete_to_suspend()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Hanya DELETE langsung pada quizzes yang jadi transisi suspend.
  -- Hapus via cascade (mis. hapus profil/pengguna) dibiarkan hard delete
  -- agar FK tidak macet: row-nya tetap harus bisa hilang.
  if pg_trigger_depth() > 1 then
    return old;
  end if;

  if exists (select 1 from public.attempts a where a.quiz_id = old.id) then
    update public.quizzes
      set status = 'suspended',
          visibilitas = 'private'
      where id = old.id;
    return null; -- lewati DELETE
  end if;
  return old;
end $$;

drop trigger if exists quizzes_delete_to_suspend on public.quizzes;
create trigger quizzes_delete_to_suspend
  before delete on public.quizzes
  for each row execute function public.quizzes_delete_to_suspend();
