-- KuisKita F9 · Migrasi 12: cabut EXECUTE fungsi percobaan dari PUBLIC
-- Bergantung pada: 20261113020001_submit_rpc.sql
--
-- Migrasi sebelumnya mencabut EXECUTE dari anon/authenticated, tetapi fungsi
-- baru otomatis memperoleh EXECUTE untuk PUBLIC (entri "=X/postgres" di
-- proacl) — sehingga PostgREST masih bisa memanggilnya. PUBLIC dicabut agar
-- hanya service_role (dan pemilik postgres) yang dapat mengeksekusi; Route
-- Handler satu-satunya pintu masuk.

revoke execute on function public.start_attempt(uuid, uuid) from public;
revoke execute on function public.get_attempt_state(uuid, uuid) from public;
revoke execute on function public.save_attempt_answer(uuid, uuid, uuid, uuid) from public;
revoke execute on function public.submit_attempt(uuid, uuid) from public;
revoke execute on function public.get_attempt_result(uuid, uuid) from public;
revoke execute on function public.expire_overdue_attempts() from public;
revoke execute on function public.grade_attempt(uuid) from public;

-- Jaga juga objek yang dibuat kelak di masa depan (opsional, aman untuk dev).
alter default privileges in schema public revoke execute on functions from public;