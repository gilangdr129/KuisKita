-- KuisKita F5 · Migrasi 8: bucket media (gambar soal & avatar) + policy
-- Bergantung pada: tidak ada (tabel storage milik Supabase Storage)
--
-- Bucket publik (gambar soal harus bisa dilihat tamu) dengan batas ukuran dan
-- whitelist MIME di tingkat bucket. Aplikasi mengunggah lewat service role
-- setelah validasi; policy di bawah menjaga unggahan langsung lewat anon key
-- tetap terbatas pada folder milik pengguna sendiri (<uid>/...).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media-kuis',
  'media-kuis',
  true,
  2097152, -- 2 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Baca: publik (gambar soal & avatar tampil untuk semua pengunjung).
drop policy if exists media_baca_publik on storage.objects;
create policy media_baca_publik on storage.objects
  for select using (bucket_id = 'media-kuis');

-- Tulis/ubah/hapus: hanya folder milik sendiri (nama folder pertama = uid).
drop policy if exists media_tulis_milik_sendiri on storage.objects;
create policy media_tulis_milik_sendiri on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media-kuis'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists media_ubah_milik_sendiri on storage.objects;
create policy media_ubah_milik_sendiri on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media-kuis'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists media_hapus_milik_sendiri on storage.objects;
create policy media_hapus_milik_sendiri on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media-kuis'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
