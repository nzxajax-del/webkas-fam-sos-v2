alter table public.member_profiles
  add column if not exists phone_number text;

create or replace function private.set_my_phone_number(p_phone_number text)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_phone text := nullif(btrim(coalesce(p_phone_number, '')), '');
begin
  if v_user_id is null then
    raise exception 'Login diperlukan' using errcode = '42501';
  end if;
  if v_phone is not null then
    v_phone := regexp_replace(v_phone, '[[:space:]().-]', '', 'g');
    if v_phone !~ '^\+?[0-9]{8,15}$' then
      raise exception 'Nomor HP harus 8–15 digit dan boleh diawali tanda +' using errcode = '22023';
    end if;
  end if;
  update public.member_profiles set phone_number = v_phone
   where id = v_user_id and status = 'active';
  if not found then raise exception 'Profil aktif tidak ditemukan' using errcode = 'P0002'; end if;
  return v_phone;
end;
$$;
revoke all on function private.set_my_phone_number(text) from public, anon;
grant execute on function private.set_my_phone_number(text) to authenticated;

create or replace function public.set_my_phone_number(p_phone_number text)
returns text language sql security invoker set search_path = pg_catalog
as $$ select private.set_my_phone_number(p_phone_number); $$;
revoke all on function public.set_my_phone_number(text) from public, anon;
grant execute on function public.set_my_phone_number(text) to authenticated;

create or replace function private.get_member_public_profile(p_member_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_caller_status text;
  v_profile public.member_profiles%rowtype;
  v_wallet public.member_wallets%rowtype;
begin
  if v_user_id is null then raise exception 'Login diperlukan' using errcode = '42501'; end if;
  select status into v_caller_status from public.member_profiles where id = v_user_id;
  if v_caller_status is distinct from 'active' then
    raise exception 'Akses hanya untuk anggota aktif dan admin aktif' using errcode = '42501';
  end if;
  select * into v_profile from public.member_profiles
   where id = p_member_id and status = 'active' and role in ('member', 'admin');
  if not found then raise exception 'Profil aktif tidak ditemukan' using errcode = 'P0002'; end if;
  select * into v_wallet from public.member_wallets where member_id = p_member_id;
  return jsonb_build_object(
    'id', v_profile.id, 'display_name', v_profile.display_name, 'role', v_profile.role,
    'status', v_profile.status, 'rank_code', v_profile.rank_code, 'phone_number', v_profile.phone_number,
    'created_at', v_profile.created_at, 'profile_photo_path', v_profile.profile_photo_path,
    'balance', coalesce(v_wallet.balance, 0), 'arrears', coalesce(v_wallet.arrears, 0),
    'exempt_kas', coalesce(v_wallet.exempt_kas, false)
  );
end;
$$;
revoke all on function private.get_member_public_profile(uuid) from public, anon;
grant execute on function private.get_member_public_profile(uuid) to authenticated;

create or replace function public.get_member_public_profile(p_member_id uuid)
returns jsonb language sql security invoker set search_path = pg_catalog
as $$ select private.get_member_public_profile(p_member_id); $$;
revoke all on function public.get_member_public_profile(uuid) from public, anon;
grant execute on function public.get_member_public_profile(uuid) to authenticated;
