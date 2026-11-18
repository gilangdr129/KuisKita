-- KuisKita F17 · Migrasi 18: suspend kuis oleh admin + audit_logs atomik
-- Bergantung pada: 20261116100001_publish_duplikasi.sql
--
-- Moderasi harus atomik: status & visibilitas berubah HANYA bersama baris
-- audit_logs (actor, aksi, target, data lama/baru, alasan). Suspend kedua
-- idempoten: tidak menulis audit lagi dan tidak mengubah apa pun.
-- Email pemilik dibaca dari auth.users agar route bisa memberi tahu kreator
-- (best-effort di luar transaksi ini).

create or replace function public.tangguhkan_kuis_admin(
  p_admin_id uuid,
  p_quiz_id uuid,
  p_alasan text default null
)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_quiz public.quizzes%rowtype;
  v_owner_username text;
  v_owner_email text;
  v_alasan text := nullif(trim(coalesce(p_alasan, '')), '');
begin
  -- Hanya admin yang boleh memoderasi. Peran dibaca dari profiles berdasarkan
  -- p_admin_id (bukan auth.uid(), yang kosong saat RPC dipanggil service role).
  if not exists (
    select 1 from public.profiles p where p.id = p_admin_id and p.role = 'admin'
  ) then
    raise exception 'ADMIN_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_quiz from public.quizzes where id = p_quiz_id;
  if not found then
    raise exception 'QUIZ_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Idempoten: sudah ditangguhkan → tak ada perubahan & tak ada audit baru.
  if v_quiz.status = 'suspended' and v_quiz.visibilitas = 'private' then
    return jsonb_build_object('status', 'suspended', 'sudah_tangguh', true);
  end if;

  select p.username into v_owner_username from public.profiles p where p.id = v_quiz.owner_id;
  select u.email into v_owner_email from auth.users u where u.id = v_quiz.owner_id;

  update public.quizzes
     set status = 'suspended',
         visibilitas = 'private'
   where id = p_quiz_id;

  insert into public.audit_logs (actor_id, aksi, target_type, target_id, metadata)
  values (
    p_admin_id,
    'quiz.suspend',
    'quizzes',
    p_quiz_id::text,
    jsonb_build_object(
      'data_lama', jsonb_build_object('status', v_quiz.status, 'visibilitas', v_quiz.visibilitas),
      'data_baru', jsonb_build_object(
        'status', 'suspended',
        'visibilitas', 'private',
        'judul', v_quiz.judul,
        'alasan', v_alasan
      )
    )
  );

  return jsonb_build_object(
    'status', 'suspended',
    'sudah_tangguh', false,
    'judul', v_quiz.judul,
    'owner_id', v_quiz.owner_id,
    'owner_username', v_owner_username,
    'owner_email', v_owner_email,
    'alasan', v_alasan
  );
end $$;

-- PostgREST tidak boleh memanggil RPC admin secara langsung.
revoke execute on function public.tangguhkan_kuis_admin(uuid, uuid, text) from anon, authenticated, public;