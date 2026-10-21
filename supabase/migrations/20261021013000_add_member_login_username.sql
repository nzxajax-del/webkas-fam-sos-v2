-- Add stable username login identifier without exposing auth email addresses.
alter table public.member_profiles add column if not exists login_username text;

update public.member_profiles
set login_username = 'member-' || left(id::text, 8)
where login_username is null or btrim(login_username) = '';

alter table public.member_profiles alter column login_username set not null;
create unique index if not exists member_profiles_login_username_lower_uidx
  on public.member_profiles (lower(login_username));
alter table public.member_profiles
  add constraint member_profiles_login_username_format
  check (login_username ~ '^[a-z0-9._-]{3,30}$');

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  requested_name text;
  requested_username text;
begin
  requested_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if requested_name is null then
    requested_name := 'member-' || left(new.id::text, 8);
  end if;

  requested_username := lower(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'login_username', '')), ''));
  if requested_username is null then
    requested_username := 'member-' || left(new.id::text, 8);
  end if;
  if requested_username !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Username must be 3-30 lowercase letters, numbers, dots, underscores or hyphens';
  end if;

  insert into public.member_profiles (id, display_name, login_username, role, status)
  values (new.id, requested_name, requested_username, 'member', 'pending');

  insert into public.member_wallets (member_id, adm_due)
  values (new.id, coalesce((select s.adm_default from public.dues_settings s where s.id = 1), 10000));

  return new;
end;
$$;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
