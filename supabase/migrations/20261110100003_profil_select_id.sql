-- KuisKita F4 · Migrasi 7: authenticated boleh membaca kolom id profiles
-- Bergantung pada: 20261110100002_profil_read_columns.sql
--
-- Diperlukan untuk query/filter berbasis id milik sendiri (mis. PATCH profil
-- dengan .eq("id", auth.uid()) dan halaman profil). Kolom id sama dengan
-- auth.users.id yang sudah terekspos di JWT (klaim sub), jadi tidak menambah
-- kebocoran data.

grant select (id) on public.profiles to authenticated;
