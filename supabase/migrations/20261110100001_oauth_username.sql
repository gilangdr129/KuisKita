-- KuisKita F4 · Migrasi 5: username otomatis untuk pengguna OAuth (Google)
-- Bergantung pada: 20261109093001_username_from_metadata.sql
--
-- Perilaku:
--   * username eksplisit (pendaftaran email) → bentrok = signup dibatalkan
--     dengan pesan 'username sudah dipakai' (API membalas 409).
--   * tanpa username eksplisit (OAuth Google) → username diturunkan dari
--     full_name/name/email; bentrok diberi sufiks acak supaya login tetap jalan.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_requested text := coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), '');
  v_explicit boolean := v_requested ~ '^[a-z0-9_.]{3,20}$';
  v_source text;
  v_candidate text;
  v_final text;
  v_attempt integer := 0;
begin
  if v_explicit then
    begin
      insert into public.profiles (id, username) values (new.id, v_requested);
      return new;
    exception
      when unique_violation then
        raise exception 'username sudah dipakai' using errcode = 'P0001';
    end;
  end if;

  -- Turunkan dari nama lengkap (OAuth) lalu email local part.
  v_source := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );
  v_source := lower(regexp_replace(v_source, '[^a-zA-Z0-9_.]+', '_', 'g'));
  v_source := btrim(v_source, '_');
  v_candidate := substr(v_source, 1, 20);

  if v_candidate !~ '^[a-z0-9_.]{3,20}$' then
    v_candidate := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  loop
    v_attempt := v_attempt + 1;

    if v_attempt = 1 then
      v_final := v_candidate;
    else
      v_final := substr(v_candidate, 1, 15) || '_' || substr(gen_random_uuid()::text, 1, 4);
    end if;

    begin
      insert into public.profiles (id, username) values (new.id, v_final);
      return new;
    exception
      when unique_violation then
        if v_attempt >= 3 then
          v_final := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8)
                     || '_' || substr(gen_random_uuid()::text, 1, 8);
          begin
            insert into public.profiles (id, username) values (new.id, v_final);
            return new;
          exception
            when unique_violation then
              raise exception 'gagal membuat username unik' using errcode = 'P0001';
          end;
        end if;
    end;
  end loop;
end $$;
