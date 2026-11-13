-- KuisKita F7 · Migrasi 9: RPC percobaan (start & state)
-- Bergantung pada: 20261109020001_schema.sql (attempts), 20261109020002_triggers.sql
--
-- Semua penulisan attempts dilakukan lewat fungsi SECURITY DEFINER milik
-- server (PRD §12: operasi atomik via RPC), sehingga client tidak pernah bisa
-- menulis expires_at/skor/status secara langsung, sementara auth.uid() tetap
-- menentukan pemilik percobaan.

-- ============================================================
-- start_attempt(p_quiz_id): buat atau kembalikan attempt aktif
-- ============================================================
create or replace function public.start_attempt(p_quiz_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_quiz public.quizzes%rowtype;
  v_attempt public.attempts%rowtype;
  v_acak jsonb;
  v_total_soal integer;
  v_selesai integer;
  v_dibuat_baru boolean := false;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  -- Idempoten: attempt in_progress milik pengguna ini dikembalikan.
  select * into v_attempt
    from public.attempts
   where quiz_id = p_quiz_id and user_id = v_user and status = 'in_progress'
   limit 1;
  if found then
    return (select jsonb_build_object(
              'attempt', to_jsonb(a),
              'acak', a.acak,
              'dibuat_baru', false,
              'server_now', now(),
              'sisa_detik', greatest(0, extract(epoch from (a.expires_at - now()))::int),
              'total_soal', (select count(*) from public.questions q where q.quiz_id = a.quiz_id)
            )
          from public.attempts a where a.id = v_attempt.id);
  end if;

  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found then
    raise exception 'QUIZ_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_quiz.status <> 'published' then
    raise exception 'QUIZ_NOT_PUBLISHED' using errcode = 'P0001';
  end if;

  -- Batas percobaan: hanya attempt non-aktif yang dihitung.
  select count(*) into v_selesai
    from public.attempts
   where quiz_id = p_quiz_id and user_id = v_user and status <> 'in_progress';

  if v_quiz.maks_percobaan is not null and v_selesai >= v_quiz.maks_percobaan then
    raise exception 'MAX_ATTEMPTS_REACHED' using errcode = 'P0001';
  end if;

  -- Snapshot acak: urutan soal + urutan opsi per soal, dibekukan di attempt.
  v_acak := jsonb_build_object(
    'soal', (select jsonb_agg(s.id order by s.acak)
               from (select id, random() as acak
                       from public.questions
                      where quiz_id = p_quiz_id) s),
    'opsi', (select jsonb_object_agg(t.question_id, t.opsi)
               from (select q.id as question_id,
                            array_agg(o.id order by random()) as opsi
                       from public.questions q
                       join public.options o on o.question_id = q.id
                      where q.quiz_id = p_quiz_id
                      group by q.id) t)
  );

  insert into public.attempts (quiz_id, user_id, expires_at, acak)
  values (
    p_quiz_id,
    v_user,
    now() + make_interval(secs => v_quiz.durasi_detik::double precision),
    v_acak
  )
  on conflict (quiz_id, user_id) where status = 'in_progress' do nothing
  returning * into v_attempt;

  if not found then
    -- Balapan (dua request bersamaan): partial unique index menang, pakai yang ada.
    select * into v_attempt
      from public.attempts
     where quiz_id = p_quiz_id and user_id = v_user and status = 'in_progress'
     limit 1;
  else
    v_dibuat_baru := true;
  end if;

  select count(*) into v_total_soal from public.questions where quiz_id = p_quiz_id;

  return jsonb_build_object(
    'attempt', to_jsonb(v_attempt),
    'acak', v_attempt.acak,
    'dibuat_baru', v_dibuat_baru,
    'server_now', now(),
    'sisa_detik', greatest(0, extract(epoch from (v_attempt.expires_at - now()))::int),
    'total_soal', v_total_soal
  );
end $$;

-- ============================================================
-- get_attempt_state(p_attempt_id): state percobaan milik pengguna
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
    'server_now', now(),
    'sisa_detik', greatest(0, extract(epoch from (v_attempt.expires_at - now()))::int),
    'total_soal', v_total_soal,
    'sudah_dijawab', v_sudah
  );
end $$;
