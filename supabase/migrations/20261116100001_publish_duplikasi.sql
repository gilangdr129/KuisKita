-- KuisKita F14 · Migrasi 17: terbitkan kuis (validasi) + duplikasi
-- Bergantung pada: 20261116090001_editor_soal.sql, 20261109020002_triggers.sql
--
-- Terbit: validasi eksplisit di database (bukan hanya UI) — minimal 1 soal,
-- setiap soal tepat 1 kunci (PK menjamin tak lebih dari satu, di sini dijaga
-- tak kurang dari satu), minimal 2 opsi, dan gambar hanya dari bucket media-kuis
-- (unggahan F5 yang sudah dibatasi 2 MB + MIME sniff).
--
-- Duplikasi: salinan metadata + soal + opsi + KUNCI sebagai draf baru milik
-- pemilik yang sama, tanpa percobaan. Inilah jalur "versi baru" untuk kuis yang
-- struktur terkunci karena sudah dikerjakan (D4): duplikat membuat baris baru,
-- sehingga guard struktur tidak berlaku.

-- ============================================================
-- terbitkan_kuis(p_user_id, p_quiz_id)
-- ============================================================
create or replace function public.terbitkan_kuis(p_user_id uuid, p_quiz_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_quiz    public.quizzes%rowtype;
  v_jumlah  integer;
  v_tanpa_kunci text;
  v_opsi_kurang text;
  v_gambar_asing text;
begin
  select * into v_quiz from public.quizzes where id = p_quiz_id and owner_id = p_user_id;
  if not found then
    raise exception 'QUIZ_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Idempoten: kuis yang sudah terbit tidak diubah lagi (published_at dijaga).
  if v_quiz.status = 'published' then
    return jsonb_build_object(
      'status', 'published',
      'published_at', v_quiz.published_at,
      'jumlah_soal', (select count(*) from public.questions q where q.quiz_id = p_quiz_id),
      'sudah_terbit', true
    );
  end if;

  -- 1) Minimal satu soal.
  select count(*) into v_jumlah from public.questions where quiz_id = p_quiz_id;
  if v_jumlah = 0 then
    raise exception 'PUBLISH_NO_QUESTIONS: kuis harus punya minimal 1 soal sebelum terbit'
      using errcode = 'P0001';
  end if;

  -- 2) Setiap soal harus punya tepat satu kunci (PK = tak lebih dari satu).
  select string_agg(format('soal ke-%s "%s"', q.urutan, left(q.teks, 60)), '; ' order by q.urutan)
    into v_tanpa_kunci
    from public.questions q
   where q.quiz_id = p_quiz_id
     and not exists (select 1 from public.question_keys qk where qk.question_id = q.id);

  if v_tanpa_kunci is not null then
    raise exception 'PUBLISH_MISSING_KEYS: soal tanpa kunci jawaban: %', v_tanpa_kunci
      using errcode = 'P0001';
  end if;

  -- 3) Setiap soal minimal 2 opsi (jalur pemain tak boleh menampilkan 0/1 opsi).
  select string_agg(format('soal ke-%s (%s opsi)', q.urutan, hits.jumlah), '; ' order by q.urutan)
    into v_opsi_kurang
    from public.questions q
    cross join lateral (
      select count(*) as jumlah from public.options o where o.question_id = q.id
    ) hits
   where q.quiz_id = p_quiz_id and hits.jumlah < 2;

  if v_opsi_kurang is not null then
    raise exception 'PUBLISH_INVALID_OPTIONS: soal dengan opsi kurang dari 2: %', v_opsi_kurang
      using errcode = 'P0001';
  end if;

  -- 4) Gambar soal harus berasal dari unggahan media-kuis (F5 sudah membatasi
  --    ukuran & MIME); URL tak dikenal dari klien ditolak.
  select string_agg(format('soal ke-%s: %s', q.urutan, left(q.gambar_url, 80)), '; ' order by q.urutan)
    into v_gambar_asing
    from public.questions q
   where q.quiz_id = p_quiz_id
     and q.gambar_url is not null
     and q.gambar_url not like '%/storage/v1/object/public/media-kuis/%';

  if v_gambar_asing is not null then
    raise exception 'PUBLISH_INVALID_IMAGE: gambar soal bukan dari unggahan yang valid: %', v_gambar_asing
      using errcode = 'P0001';
  end if;

  update public.quizzes
     set status = 'published',
         published_at = now()
   where id = p_quiz_id;

  return jsonb_build_object(
    'status', 'published',
    'published_at', now(),
    'jumlah_soal', v_jumlah,
    'sudah_terbit', false
  );
end $$;

-- ============================================================
-- duplikasi_kuis(p_user_id, p_quiz_id) — salinan utuh sebagai draf baru
-- ============================================================
create or replace function public.duplikasi_kuis(p_user_id uuid, p_quiz_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_quiz   public.quizzes%rowtype;
  v_baru   uuid;
  v_q      public.questions%rowtype;
  v_o      public.options%rowtype;
  v_q_baru uuid;
  v_o_baru uuid;
  v_kunci  uuid;
  v_soal   integer := 0;
  v_opsi   integer := 0;
begin
  select * into v_quiz from public.quizzes where id = p_quiz_id and owner_id = p_user_id;
  if not found then
    raise exception 'QUIZ_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Judul salinan tetap <= 120 karakter (check constraint tabel).
  insert into public.quizzes (
    owner_id, judul, deskripsi, category_id, kesulitan, durasi_detik,
    visibilitas, acak_soal, acak_opsi, maks_percobaan, status
  )
  values (
    p_user_id,
    left(v_quiz.judul, 110) || ' (salinan)',
    v_quiz.deskripsi,
    v_quiz.category_id,
    v_quiz.kesulitan,
    v_quiz.durasi_detik,
    v_quiz.visibilitas,
    v_quiz.acak_soal,
    v_quiz.acak_opsi,
    v_quiz.maks_percobaan,
    'draft'
  )
  returning id into v_baru;

  -- Salin soal → opsi → kunci secara berurutan agar urutan & id baru konsisten.
  for v_q in
    select * from public.questions where quiz_id = p_quiz_id order by urutan
  loop
    insert into public.questions (quiz_id, teks, tipe, bobot, urutan, pembahasan, gambar_url)
    values (v_baru, v_q.teks, v_q.tipe, v_q.bobot, v_q.urutan, v_q.pembahasan, v_q.gambar_url)
    returning id into v_q_baru;

    v_soal := v_soal + 1;

    for v_o in
      select * from public.options where question_id = v_q.id order by urutan
    loop
      insert into public.options (question_id, teks, urutan)
      values (v_q_baru, v_o.teks, v_o.urutan)
      returning id into v_o_baru;

      v_opsi := v_opsi + 1;

      -- Bawa kunci jawaban lama bila opsi ini pernah menjadi kunci.
      select qk.option_id into v_kunci
        from public.question_keys qk where qk.question_id = v_q.id;

      if v_kunci is not null and v_kunci = v_o.id then
        insert into public.question_keys (question_id, option_id)
        values (v_q_baru, v_o_baru)
        on conflict (question_id) do nothing;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'quiz_id', v_baru,
    'judul', left(v_quiz.judul, 110) || ' (salinan)',
    'status', 'draft',
    'jumlah_soal', v_soal,
    'jumlah_opsi', v_opsi
  );
end $$;

-- ============================================================
-- PostgREST tidak boleh memanggil RPC F14 secara langsung.
-- ============================================================
revoke execute on function public.terbitkan_kuis(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.duplikasi_kuis(uuid, uuid) from anon, authenticated, public;