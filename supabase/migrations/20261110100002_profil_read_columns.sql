-- KuisKita F4 · Migrasi 6: kolom profil yang boleh dibaca klien terautentikasi
-- Bergantung pada: 20261109020001_schema.sql
--
-- PRD §15: publik (anon) hanya username + avatar_url. Pengguna yang login
-- boleh membaca tambahan role + created_at milik tabel yang sama (RLS masih
-- membatasi per baris).

grant select (username, avatar_url, role, created_at) on public.profiles to authenticated;
