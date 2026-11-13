-- KuisKita F8 · Migrasi 10: RPC simpan jawaban + state membawa jawaban
-- Bergantung pada: 20261111090001_attempt_rpc.sql
--
-- Penulisan attempt_answers hanya lewat fungsi SECURITY DEFINER milik server
-- (grant klien hanya SELECT), sehingga kolom `benar` (hasil penilaian) tak
-- pernah bisa ditulis dari luar, dan validasi kepemilikan/expiry/opsi tetap
-- berjalan walau request datang dari PostgREST dengan JWT pengguna.

-- ============================================================
-- save_attempt_answer: upsert satu jawaban per soal
-- ============================================================
create or replace function public.save_attempt_answer(
  p_attempt_id uuid,
  p_question_id uuid,
  p_option_id uuid
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_attempt public.attempts%rowtype;
  v_total_soal integer;
  v_sudah integer;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_attempt
    from public.attempts
   where id = p_attempt_id and user_id = v_user;
  if not found then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_attempt.status <> 'in_progress' then
    raise exception 'ATTEMPT_FINAL' using errcode = 'P0001';
  end if;

  if v_attempt.expires_at <= now() then
    raise exception 'ATTEMPT_EXPIRED' using errcode = 'P0001';
  end if;

  -- Opsi harus milik soal yang sama DAN milik kuis percobaan ini (anti-tamper).
  if not exists (
    select 1
      from public.options o
      join public.questions q on q.id = o.question_id
     where o.id = p_option_id
       and o.question_id = p_question_id
       and q.quiz_id = v_attempt.quiz_id
  ) then
    raise exception 'OPTION_MISMATCH' using errcode = 'P0001';
  end if;

  -- Upsert: soal hanya boleh punya satu jawaban; `benar` diisi server saat submit (F9).
  insert into public.attempt_answers (attempt_id, question_id, option_id, benar)
  values (p_attempt_id, p_question_id, p_option_id, null)
  on conflict (attempt_id, question_id)
  do update set option_id = excluded.option_id,
                answered_at = now(),
                benar = null;

  select count(*) into v_total_soal from public.questions where quiz_id = v_attempt.quiz_id;
  select count(*) into v_sudah
    from public.attempt_answers aa where aa.attempt_id = p_attempt_id;

  return jsonb_build_object(
    'tersimpan', true,
    'pertanyaan_id', p_question_id,
    'opsi_id', p_option_id,
    'server_now', now(),
    'sisa_detik', greatest(0, extract(epoch from (v_attempt.expires_at - now()))::int),
    'total_soal', v_total_soal,
    'sudah_dijawab', v_sudah
  );
end $$;

-- ============================================================
-- get_attempt_state: tambahkan daftar jawaban tersimpan (resume)
-- ============================================================
create or replace function public.get_attempt_state(p_attempt_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_attempt public.attempts%rowtype;
  v_total_soal integer;
  v_sudah integer;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_attempt
    from public.attempts
   where id = p_attempt_id and user_id = v_user;
  if not found then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select count(*) into v_total_soal from public.questions where quiz_id = v_attempt.quiz_id;
  select count(*) into v_sudah
    from public.attempt_answers aa where aa.attempt_id = v_attempt.id;

  return jsonb_build_object(
    'attempt', to_jsonb(v_attempt),
    'jawaban', (
      select coalesce(jsonb_agg(jsonb_build_object('pertanyaan_id', aa.question_id, 'opsi_id', aa.option_id)), '[]'::jsonb)
        from public.attempt_answers aa
       where aa.attempt_id = v_attempt.id
    ),
    'server_now', now(),
    'sisa_detik', greatest(0, extract(epoch from (v_attempt.expires_at - now()))::int),
    'total_soal', v_total_soal,
    'sudah_dijawab', v_sudah
  );
end $$;
