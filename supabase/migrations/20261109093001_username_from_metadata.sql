-- KuisKita F3 · Migrasi 4: pakai username dari metadata signup
-- Bergantung pada: 20261109020002_triggers.sql (profil otomatis)

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_desired text := coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), '');
begin
  if v_desired !~ '^[a-z0-9_.]{3,20}$' then
    v_desired := '';
  end if;

  if v_desired <> '' then
    begin
      insert into public.profiles (id, username) values (new.id, v_desired);
      return new;
    exception
      when unique_violation then
        -- Username sudah dipakai: batalkan signup dengan pesan khusus.
        raise exception 'username sudah dipakai' using errcode = 'P0001';
    end;
  end if;

  -- Fallback bila username tidak dikirim (OAuth, admin, dsb.).
  begin
    insert into public.profiles (id, username)
    values (new.id, 'user_' || substr(replace(new.id::text, '-', ''), 1, 8) || '_' || substr(gen_random_uuid()::text, 1, 4));
    return new;
  exception
    when unique_violation then
      insert into public.profiles (id, username)
      values (new.id, 'user_' || substr(replace(new.id::text, '-', ''), 1, 8) || '_' || substr(gen_random_uuid()::text, 1, 8));
      return new;
  end;
end $$;
