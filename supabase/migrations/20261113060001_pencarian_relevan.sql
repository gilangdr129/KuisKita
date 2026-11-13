-- KuisKita F11 · Migrasi 14: pencarian berperingkat + indeks GIN deskripsi
-- Bergantung pada: 20261113040001_list_quizzes.sql
--
-- Perubahan dari F10:
--   1. Indeks GIN pg_trgm untuk kolom deskripsi (judul sudah ada sejak F1),
--      supaya ILIKE tetap memakai indeks, bukan seq scan.
--   2. Pencarian memeringkat hasil: kemiripan trigram (judul vs deskripsi)
--      jadi kunci urutan pertama saat pencarian aktif, diikuti urutan
--      normal (terbaru/terpopuler). Kursor ikut membawa skor relevansi.
--   3. Karakter khusus LIKE (% dan _) di-escape agar diperlakukan harfiah —
--      mencegah "pola liar" dari input pengguna (parameter tetap ter-bind,
--      jadi tidak ada celah SQL injection).

drop function if exists public.list_quizzes(text, text, text, text, text, integer, text);

create or replace function public.list_quizzes(
  p_kategori text default null,
  p_kesulitan text default null,
  p_durasi text default null,
  p_q text default null,
  p_sortir text default 'terbaru',
  p_limit integer default 20,
  p_cursor text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_cursor jsonb := case when p_cursor is null or p_cursor = '' then null else p_cursor::jsonb end;
  v_cari boolean := coalesce(p_q, '') <> '';
  v_pola text := '%' || regexp_replace(p_q, '([%_\\])', '\\\\\\1', 'g') || '%';
  v_items jsonb;
  v_next_cursor jsonb;
  v_has_more boolean := false;
begin
  if p_sortir is null or p_sortir = '' then
    p_sortir := 'terbaru';
  end if;

  if p_sortir = 'terpopuler' then
    -- Terpopuler (opsi pencarian: relevansi dulu).
    with kandidat as (
      select q.id,
             q.judul,
             q.deskripsi,
             q.kesulitan,
             q.durasi_detik,
             q.published_at,
             q.created_at,
             c.nama as kategori_nama,
             c.slug as kategori_slug,
             pr.username as kreator_username,
             (select count(*) from public.attempts a where a.quiz_id = q.id) as percobaan,
             case when v_cari then greatest(
                    extensions.similarity(coalesce(q.judul, ''), p_q),
                    extensions.similarity(coalesce(q.deskripsi, ''), p_q)
                  ) else 0 end as relevansi
        from public.quizzes q
        left join public.categories c on c.id = q.category_id
        left join public.profiles pr on pr.id = q.owner_id
       where q.status = 'published'
         and q.visibilitas = 'public'
         and (p_kategori is null or c.slug = p_kategori)
         and (p_kesulitan is null or q.kesulitan = p_kesulitan)
         and (
           not v_cari
           or q.judul ilike v_pola escape '\'
           or q.deskripsi ilike v_pola escape '\'
         )
         and (
           p_durasi is null
           or (p_durasi = 'pendek' and q.durasi_detik <= 300)
           or (p_durasi = 'sedang' and q.durasi_detik > 300 and q.durasi_detik <= 900)
           or (p_durasi = 'panjang' and q.durasi_detik > 900)
         )
         and (
           v_cursor is null
           or (
             (case when v_cari then greatest(
                    extensions.similarity(coalesce(q.judul, ''), p_q),
                    extensions.similarity(coalesce(q.deskripsi, ''), p_q)
                  ) else 0 end,
              (select count(*) from public.attempts a where a.quiz_id = q.id),
              q.id::text
             ) < (
(v_cursor ->> 'r')::double precision,
              (v_cursor ->> 'c')::integer,
              (v_cursor ->> 'i')
            )
          )
          )
    ), bernomor as (
      select k.*,
             row_number() over (
               order by case when v_cari then k.relevansi else 0 end desc,
                        k.percobaan desc,
                        k.id desc
             ) as rn
        from kandidat k
    )
    select jsonb_agg(jsonb_build_object(
             'id', b.id,
             'judul', b.judul,
             'deskripsi', b.deskripsi,
             'kesulitan', b.kesulitan,
             'durasi_detik', b.durasi_detik,
             'published_at', b.published_at,
             'created_at', b.created_at,
             'kategori', jsonb_build_object('nama', b.kategori_nama, 'slug', b.kategori_slug),
             'kreator_username', b.kreator_username,
             'jumlah_percobaan', b.percobaan,
             'relevansi', b.relevansi,
             'jumlah_soal', (select count(*) from public.questions qq where qq.quiz_id = b.id),
             'skor_tertinggi', (select max(a.persentase) from public.attempts a
                                 where a.quiz_id = b.id and a.submitted_at is not null)
           ) order by b.rn)
      into v_items
      from (select * from bernomor where rn <= v_limit + 1) b;

    if jsonb_array_length(coalesce(v_items, '[]'::jsonb)) > v_limit then
      v_has_more := true;
      v_items := (select jsonb_agg(e order by idx)
                    from (select e, ord - 1 as idx
                            from jsonb_array_elements(v_items) with ordinality as t(e, ord)) s
                   where idx < v_limit);
      select jsonb_build_object(
               'r', (e ->> 'relevansi')::double precision,
               'c', (e ->> 'jumlah_percobaan')::integer,
               'i', e ->> 'id'
             )
        into v_next_cursor
        from jsonb_array_elements(v_items) with ordinality as t(e, ord)
       where ord = v_limit;
    end if;
  else
    -- Terbaru (opsi pencarian: relevansi dulu).
    with kandidat as (
      select q.id,
             q.judul,
             q.deskripsi,
             q.kesulitan,
             q.durasi_detik,
             q.published_at,
             q.created_at,
             c.nama as kategori_nama,
             c.slug as kategori_slug,
             pr.username as kreator_username,
             (select count(*) from public.attempts a where a.quiz_id = q.id) as percobaan,
             case when v_cari then greatest(
                    extensions.similarity(coalesce(q.judul, ''), p_q),
                    extensions.similarity(coalesce(q.deskripsi, ''), p_q)
                  ) else 0 end as relevansi
        from public.quizzes q
        left join public.categories c on c.id = q.category_id
        left join public.profiles pr on pr.id = q.owner_id
       where q.status = 'published'
         and q.visibilitas = 'public'
         and (p_kategori is null or c.slug = p_kategori)
         and (p_kesulitan is null or q.kesulitan = p_kesulitan)
         and (
           not v_cari
           or q.judul ilike v_pola escape '\'
           or q.deskripsi ilike v_pola escape '\'
         )
         and (
           p_durasi is null
           or (p_durasi = 'pendek' and q.durasi_detik <= 300)
           or (p_durasi = 'sedang' and q.durasi_detik > 300 and q.durasi_detik <= 900)
           or (p_durasi = 'panjang' and q.durasi_detik > 900)
         )
         and (
           v_cursor is null
           or (
             (case when v_cari then greatest(
                    extensions.similarity(coalesce(q.judul, ''), p_q),
                    extensions.similarity(coalesce(q.deskripsi, ''), p_q)
                  ) else 0 end,
              q.published_at,
              q.id::text
) < (
                (v_cursor ->> 'r')::double precision,
                (v_cursor ->> 't')::timestamptz,
                (v_cursor ->> 'i')
              )
          )
          )
    ), bernomor as (
      select k.*,
             row_number() over (
               order by case when v_cari then k.relevansi else 0 end desc,
                        k.published_at desc,
                        k.id desc
             ) as rn
        from kandidat k
    )
    select jsonb_agg(jsonb_build_object(
             'id', b.id,
             'judul', b.judul,
             'deskripsi', b.deskripsi,
             'kesulitan', b.kesulitan,
             'durasi_detik', b.durasi_detik,
             'published_at', b.published_at,
             'created_at', b.created_at,
             'kategori', jsonb_build_object('nama', b.kategori_nama, 'slug', b.kategori_slug),
             'kreator_username', b.kreator_username,
             'jumlah_percobaan', b.percobaan,
             'relevansi', b.relevansi,
             'jumlah_soal', (select count(*) from public.questions qq where qq.quiz_id = b.id),
             'skor_tertinggi', (select max(a.persentase) from public.attempts a
                                 where a.quiz_id = b.id and a.submitted_at is not null)
           ) order by b.rn)
      into v_items
      from (select * from bernomor where rn <= v_limit + 1) b;

    if jsonb_array_length(coalesce(v_items, '[]'::jsonb)) > v_limit then
      v_has_more := true;
      v_items := (select jsonb_agg(e order by idx)
                    from (select e, ord - 1 as idx
                            from jsonb_array_elements(v_items) with ordinality as t(e, ord)) s
                   where idx < v_limit);
      select jsonb_build_object(
               'r', (e ->> 'relevansi')::double precision,
               't', e ->> 'published_at',
               'i', e ->> 'id'
             )
        into v_next_cursor
        from jsonb_array_elements(v_items) with ordinality as t(e, ord)
       where ord = v_limit;
    end if;
  end if;

  return jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'next_cursor', v_next_cursor,
    'has_more', v_has_more
  );
end $$;

-- Indeks GIN untuk pencarian deskripsi (judul sudah ada: quizzes_judul_trgm_idx).
create index if not exists quizzes_deskripsi_trgm_idx
  on public.quizzes using gin (deskripsi extensions.gin_trgm_ops);

grant execute on function public.list_quizzes(text, text, text, text, text, integer, text)
  to anon, authenticated;