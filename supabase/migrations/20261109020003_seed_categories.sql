-- KuisKita F1 · Migrasi 3: seed kategori awal (10 baris)
-- Bergelantung pada: 20261109020001_schema.sql

insert into public.categories (nama, slug) values
  ('Umum',      'umum'),
  ('Sains',     'sains'),
  ('Sejarah',   'sejarah'),
  ('Geografi',  'geografi'),
  ('Teknologi', 'teknologi'),
  ('Hiburan',   'hiburan'),
  ('Bahasa',    'bahasa'),
  ('Matematika','matematika'),
  ('Budaya',    'budaya'),
  ('Lainnya',   'lainnya')
on conflict (slug) do nothing;
