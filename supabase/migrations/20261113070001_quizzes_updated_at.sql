-- KuisKita F12 · Migrasi 15: kolom updated_at untuk quizzes
-- Bergelantung pada: 20261109020001_schema.sql
--
-- Dasbor kreator mengurutkan kuis berdasarkan perubahan terakhir; kolom ini
-- diisi otomatis oleh trigger (tidak dapat dimanipulasi klien) dan menjadi
-- dasar duplikasi/versi baru di F14.

-- Ditambah nullable dulu agar baris lama bisa di-backfill dari created_at
-- (bukan waktu migrasi), lalu dikunci not null + default now().
alter table public.quizzes
  add column if not exists updated_at timestamptz;
update public.quizzes set updated_at = created_at where updated_at is null;
alter table public.quizzes alter column updated_at set default now();
alter table public.quizzes alter column updated_at set not null;

create or replace function public.quizzes_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists quizzes_set_updated_at on public.quizzes;
create trigger quizzes_set_updated_at
  before update on public.quizzes
  for each row execute function public.quizzes_set_updated_at();