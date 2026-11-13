-- KuisKita F9 · Migrasi 11: RPC penilaian (submit), hasil, expiry otomatis
-- Bergantung pada: 20261111090001_attempt_rpc.sql, 20261113010001_answer_rpc.sql
--
-- Perubahan penting: seluruh RPC percobaan kini menerima p_user_id (diisi route
-- handler setelah memverifikasi sesi) dan EXECUTE-nya dicabut dari anon/
-- authenticated, sehingga PostgREST tidak lagi bisa memanggilnya langsung
-- (satu-satunya pintu = Route Handler kita, tempat rate limit & log berlaku).

drop function if exists public.start_attempt(uuid);
drop function if exists public.get_attempt_state(uuid);
drop function if exists public.save_attempt_answer(uuid, uuid, uuid);

-- ============================================================
-- grade_attempt: internal — set benar/salah per jawaban & hitung nilai
-- ============================================================
create or replace function public.grade_attempt(p_attempt_id uuid)
returns table (
  skor numeric,
  persentase numeric,
  benar integer,
  salah integer,
  total_soal integer,
  total_bobot numeric
)
language plpgsql security definer set search_path = public as $$
declare
  v_skor numeric;
  v_total_bobot numeric;
  v_benar integer;
  v_total_soal integer;
  v_terjawab integer;
  v_quiz_id uuid;
begin
  -- 1) Tandai benar/salah per jawaban. Dilewati bila attempt sudah final
  --    (trigger answers_block_after_submit memang akan menolak tulisan; hasil
  --    penilaian terakhir sudah tersimpan dari submit pertama).
  update public.attempt_answers aa
     set benar = exists (
       select 1
         from public.question_keys qk
        where qk.question_id = aa.question_id
          and qk.option_id = aa.option_id
     )
   where aa.attempt_id = p_attempt_id
     and not exists (
       select 1 from public.attempts a
        where a.id = aa.attempt_id and a.submitted_at is not null
     );

  select quiz_id into v_quiz_id from public.attempts where id = p_attempt_id;
  if v_quiz_id is null then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- 2) Nilai berbobot: total bobot soal yang dijawab benar.
  select coalesce(sum(case when aa.benar then q.bobot else 0 end), 0),
         count(*) filter (where aa.benar)
    into v_skor, v_benar
    from public.attempt_answers aa
    join public.questions q on q.id = aa.question_id
   where aa.attempt_id = p_attempt_id;

  select count(*) into v_terjawab
    from public.attempt_answers aa where aa.attempt_id = p_attempt_id;

  -- 3) Pembagi: total bobot & jumlah soal milik KUIS (bukan milik jawaban).
  select coalesce(sum(q.bobot), 0), count(*)
    into v_total_bobot, v_total_soal
    from public.questions q
   where q.quiz_id = v_quiz_id;

  return query
    select
      v_skor,
      case when v_total_bobot > 0 then round(v_skor / v_total_bobot * 100, 2) else 0 end,
      v_benar,
      greatest(0, v_terjawab - v_benar),
      v_total_soal,
      v_total_bobot;
end $$;

-- ============================================================
-- start_attempt(p_quiz_id, p_user_id): buat atau kembalikan attempt aktif
-- ============================================================
create or replace function public.start_attempt(p_quiz_id uuid, p_user_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_quiz public.quizzes%rowtype;
  v_attempt public.attempts%rowtype;
  v_acak jsonb;
  v_total_soal integer;
  v_selesai integer;
  v_dibuat_baru boolean := false;
begin
  -- Idempoten: attempt in_progress milik pengguna ini dikembalikan.
  select * into v_attempt
    from public.attempts
   where quiz_id = p_quiz_id and user_id = p_user_id and status = 'in_progress'
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

  select count(*) into v_selesai
    from public.attempts
   where quiz_id = p_quiz_id and user_id = p_user_id and status <> 'in_progress';

  if v_quiz.maks_percobaan is not null and v_selesai >= v_quiz.maks_percobaan then
    raise exception 'MAX_ATTEMPTS_REACHED' using errcode = 'P0001';
  end if;

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
    p_user_id,
    now() + make_interval(secs => v_quiz.durasi_detik::double precision),
    v_acak
  )
  on conflict (quiz_id, user_id) where status = 'in_progress' do nothing
  returning * into v_attempt;

  if not found then
    select * into v_attempt
      from public.attempts
     where quiz_id = p_quiz_id and user_id = p_user_id and status = 'in_progress'
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
-- get_attempt_state(p_attempt_id, p_user_id)
-- ============================================================
create or replace function public.get_attempt_state(p_attempt_id uuid, p_user_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_attempt public.attempts%rowtype;
  v_total_soal integer;
  v_sudah integer;
begin
  select * into v_attempt
    from public.attempts
   where id = p_attempt_id and user_id = p_user_id;
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

-- ============================================================
-- save_attempt_answer(p_attempt_id, p_user_id, p_question_id, p_option_id)
-- ============================================================
create or replace function public.save_attempt_answer(
  p_attempt_id uuid,
  p_user_id uuid,
  p_question_id uuid,
  p_option_id uuid
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_attempt public.attempts%rowtype;
  v_total_soal integer;
  v_sudah integer;
begin
  select * into v_attempt
    from public.attempts
   where id = p_attempt_id and user_id = p_user_id;
  if not found then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_attempt.status <> 'in_progress' then
    raise exception 'ATTEMPT_FINAL' using errcode = 'P0001';
  end if;

  if v_attempt.expires_at <= now() then
    raise exception 'ATTEMPT_EXPIRED' using errcode = 'P0001';
  end if;

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
-- submit_attempt(p_attempt_id, p_user_id): nilai & finalkan (idempoten)
-- ============================================================
create or replace function public.submit_attempt(p_attempt_id uuid, p_user_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_attempt public.attempts%rowtype;
  v_waktu_submit timestamptz;
  v_status text;
  v_nilai record;
begin
  select * into v_attempt
    from public.attempts
   where id = p_attempt_id and user_id = p_user_id;
  if not found then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Idempoten: percobaan final selalu mengembalikan hasil yang sudah ada.
  if v_attempt.submitted_at is not null or v_attempt.status <> 'in_progress' then
    return (select jsonb_build_object(
              'sudah_final', true,
              'status', a.status,
              'skor', a.skor,
              'persentase', a.persentase,
              'durasi_ms', a.durasi_ms,
              'submitted_at', a.submitted_at,
              'expired', a.status = 'expired'
            )
          from public.attempts a where a.id = v_attempt.id);
  end if;

  -- Waktu habis: nilai memakai simpanan terakhir, submit dicatat pada batas waktu.
  if v_attempt.expires_at <= now() then
    v_status := 'expired';
    v_waktu_submit := v_attempt.expires_at;
  else
    v_status := 'submitted';
    v_waktu_submit := now();
  end if;

  select * into v_nilai from public.grade_attempt(p_attempt_id);

  update public.attempts a
     set status = v_status,
         submitted_at = v_waktu_submit,
         skor = v_nilai.skor,
         persentase = v_nilai.persentase,
         durasi_ms = greatest(0, extract(epoch from (v_waktu_submit - a.started_at))::integer * 1000)
   where a.id = p_attempt_id;

  return jsonb_build_object(
    'sudah_final', false,
    'status', v_status,
    'skor', v_nilai.skor,
    'persentase', v_nilai.persentase,
    'benar', v_nilai.benar,
    'salah', v_nilai.salah,
    'total_soal', v_nilai.total_soal,
    'durasi_ms', greatest(0, extract(epoch from (v_waktu_submit - v_attempt.started_at))::integer * 1000),
    'submitted_at', v_waktu_submit,
    'expired', v_status = 'expired'
  );
end $$;

-- ============================================================
-- get_attempt_result(p_attempt_id, p_user_id): hasil + pembahasan
-- ============================================================
create or replace function public.get_attempt_result(p_attempt_id uuid, p_user_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_attempt public.attempts%rowtype;
  v_nilai record;
begin
  select * into v_attempt
    from public.attempts
   where id = p_attempt_id and user_id = p_user_id;
  if not found then
    raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_attempt.submitted_at is null then
    raise exception 'ATTEMPT_NOT_SUBMITTED' using errcode = 'P0001';
  end if;

  select * into v_nilai from public.grade_attempt(p_attempt_id);

  return jsonb_build_object(
    'attempt', to_jsonb(v_attempt),
    'ringkasan', jsonb_build_object(
      'skor', v_attempt.skor,
      'persentase', v_attempt.persentase,
      'benar', v_nilai.benar,
      'salah', v_nilai.salah,
      'total_soal', v_nilai.total_soal,
      'total_bobot', v_nilai.total_bobot,
      'durasi_ms', v_attempt.durasi_ms,
      'status', v_attempt.status,
      'submitted_at', v_attempt.submitted_at
    ),
    'soal', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', q.id,
               'teks', q.teks,
               'tipe', q.tipe,
               'bobot', q.bobot,
               'pembahasan', q.pembahasan,
               'benar', aa.benar,
               'opsi_terpilih_id', aa.option_id,
               'opsi_benar_id', qk.option_id,
               'opsi', (select jsonb_agg(jsonb_build_object('id', o.id, 'teks', o.teks, 'urutan', o.urutan) order by o.urutan)
                          from public.options o where o.question_id = q.id)
             ) order by q.urutan), '[]'::jsonb)
        from public.attempt_answers aa
        join public.questions q on q.id = aa.question_id
        left join public.question_keys qk on qk.question_id = q.id
       where aa.attempt_id = p_attempt_id
    )
  );
end $$;

-- ============================================================
-- expire_overdue_attempts(): sweep percobaan lewat batas waktu (cron)
-- ============================================================
create or replace function public.expire_overdue_attempts()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_jumlah integer;
begin
  with target as (
    select id from public.attempts
     where status = 'in_progress' and expires_at <= now()
     for update
  )
  -- 1) Nilai jawaban tersimpan SEBELUM attempt ditutup (trigger masih mengizinkan).
  update public.attempt_answers aa
     set benar = exists (
       select 1
         from public.question_keys qk
        where qk.question_id = aa.question_id
          and qk.option_id = aa.option_id
     )
   where aa.attempt_id in (select id from target);

  -- 2) Tutup percobaan tepat pada batas waktu, dengan nilai dari autosave.
  with target as (
    select id from public.attempts
     where status = 'in_progress' and expires_at <= now()
     for update
  ), nilai as (
    select a.id as attempt_id,
           coalesce(sum(case when aa.benar then q.bobot else 0 end), 0) as skor,
           (select coalesce(sum(q2.bobot), 0)
              from public.questions q2 where q2.quiz_id = a.quiz_id) as total_bobot
      from public.attempts a
      join target t on t.id = a.id
      left join public.attempt_answers aa on aa.attempt_id = a.id
      left join public.questions q on q.id = aa.question_id
     group by a.id
  )
  update public.attempts a
     set status = 'expired',
         submitted_at = a.expires_at,
         skor = n.skor,
         persentase = case when n.total_bobot > 0 then round(n.skor / n.total_bobot * 100, 2) else 0 end,
         durasi_ms = extract(epoch from (a.expires_at - a.started_at))::integer * 1000
    from nilai n
   where a.id = n.attempt_id;

  get diagnostics v_jumlah = row_count;
  return v_jumlah;
end $$;

-- ============================================================
-- PostgREST tidak boleh memanggil RPC percobaan secara langsung.
-- ============================================================
revoke execute on function public.start_attempt(uuid, uuid) from anon, authenticated;
revoke execute on function public.get_attempt_state(uuid, uuid) from anon, authenticated;
revoke execute on function public.save_attempt_answer(uuid, uuid, uuid, uuid) from anon, authenticated;
revoke execute on function public.submit_attempt(uuid, uuid) from anon, authenticated;
revoke execute on function public.get_attempt_result(uuid, uuid) from anon, authenticated;
revoke execute on function public.expire_overdue_attempts() from anon, authenticated;
revoke execute on function public.grade_attempt(uuid) from anon, authenticated;
