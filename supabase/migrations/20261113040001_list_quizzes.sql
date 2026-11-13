-- KuisKita F10 · Migrasi 13: RPC katalog (filter, sortir, paginasi cursor)
-- Bergantung pada: 20261109020001_schema.sql
--
-- Katalog adalah data publik: RPC hanya mengembalikan kuis berstatus
-- published dan visibilitas public. Paginasi memakai kursor (bukan OFFSET)
-- agar stabil saat kuis baru terbit di tengah daftar.

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
  v_items jsonb;
  v_next_cursor jsonb;
  v_has_more boolean := false;
begin
  if p_sortir is null or p_sortir = '' then
    p_sortir := 'terbaru';
  end if;

  if p_sortir = 'terpopuler' then
    -- Terpopuler: jumlah percobaan desc, lalu id desc. Urutan tuple kursor
    -- harus sama dengan ORDER BY.
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
             (select count(*) from public.attempts a where a.quiz_id = q.id) as percobaan
        from public.quizzes q
        left join public.categories c on c.id = q.category_id
        left join public.profiles pr on pr.id = q.owner_id
       where q.status = 'published'
         and q.visibilitas = 'public'
         and (p_kategori is null or c.slug = p_kategori)
         and (p_kesulitan is null or q.kesulitan = p_kesulitan)
         and (p_q is null or p_q = '' or q.judul ilike '%' || p_q || '%' or q.deskripsi ilike '%' || p_q || '%')
         and (
           p_durasi is null
           or (p_durasi = 'pendek' and q.durasi_detik <= 300)
           or (p_durasi = 'sedang' and q.durasi_detik > 300 and q.durasi_detik <= 900)
           or (p_durasi = 'panjang' and q.durasi_detik > 900)
         )
         and (
           v_cursor is null
           or ((select count(*) from public.attempts a where a.quiz_id = q.id), q.id::text)
              < ((v_cursor ->> 'c')::integer, (v_cursor ->> 'i'))
         )
    ), bernomor as (
      select k.*, row_number() over (order by k.percobaan desc, k.id desc) as rn
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
      select jsonb_build_object('c', (e ->> 'jumlah_percobaan')::integer, 'i', e ->> 'id')
        into v_next_cursor
        from jsonb_array_elements(v_items) with ordinality as t(e, ord)
       where ord = v_limit;
    end if;
  else
    -- Terbaru: published_at desc, lalu id desc.
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
             (select count(*) from public.attempts a where a.quiz_id = q.id) as percobaan
        from public.quizzes q
        left join public.categories c on c.id = q.category_id
        left join public.profiles pr on pr.id = q.owner_id
       where q.status = 'published'
         and q.visibilitas = 'public'
         and (p_kategori is null or c.slug = p_kategori)
         and (p_kesulitan is null or q.kesulitan = p_kesulitan)
         and (p_q is null or p_q = '' or q.judul ilike '%' || p_q || '%' or q.deskripsi ilike '%' || p_q || '%')
         and (
           p_durasi is null
           or (p_durasi = 'pendek' and q.durasi_detik <= 300)
           or (p_durasi = 'sedang' and q.durasi_detik > 300 and q.durasi_detik <= 900)
           or (p_durasi = 'panjang' and q.durasi_detik > 900)
         )
         and (
           v_cursor is null
           or (q.published_at, q.id::text) < ((v_cursor ->> 't')::timestamptz, (v_cursor ->> 'i'))
         )
    ), bernomor as (
      select k.*, row_number() over (order by k.published_at desc, k.id desc) as rn
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
      select jsonb_build_object('t', e ->> 'published_at', 'i', e ->> 'id')
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

-- Katalog terbuka untuk publik (termasuk pengunjung belum login).
grant execute on function public.list_quizzes(text, text, text, text, text, integer, text)
  to anon, authenticated;