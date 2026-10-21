-- Restore Admin Assistant visibility in the shared-chat profile popup.
-- This is a function-only migration: no financial or member data is modified.

create or replace function private.get_member_public_profile(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_caller_status text;
  v_profile public.member_profiles%rowtype;
  v_wallet public.member_wallets%rowtype;
begin
  if v_user_id is null then
    raise exception 'Login diperlukan' using errcode = '42501';
  end if;

  select status into v_caller_status
  from public.member_profiles
  where id = v_user_id;

  if v_caller_status is distinct from 'active' then
    raise exception 'Akses hanya untuk anggota aktif dan admin aktif' using errcode = '42501';
  end if;

  select * into v_profile
  from public.member_profiles
  where id = p_member_id
    and status = 'active'
    and role in ('member', 'admin', 'admin_assistant');

  if not found then
    raise exception 'Profil aktif tidak ditemukan' using errcode = 'P0002';
  end if;

  select * into v_wallet
  from public.member_wallets
  where member_id = p_member_id;

  return jsonb_build_object(
    'id', v_profile.id,
    'display_name', v_profile.display_name,
    'role', v_profile.role,
    'status', v_profile.status,
    'rank_code', v_profile.rank_code,
    'phone_number', v_profile.phone_number,
    'created_at', v_profile.created_at,
    'profile_photo_path', v_profile.profile_photo_path,
    'balance', coalesce(v_wallet.balance, 0),
    'arrears', coalesce(v_wallet.arrears, 0),
    'exempt_kas', coalesce(v_wallet.exempt_kas, false)
  );
end;
$function$;

revoke all on function private.get_member_public_profile(uuid) from public, anon;
grant execute on function private.get_member_public_profile(uuid) to authenticated;

create or replace function public.get_member_public_profile(p_member_id uuid)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $function$
  select private.get_member_public_profile(p_member_id);
$function$;

revoke all on function public.get_member_public_profile(uuid) from public, anon;
grant execute on function public.get_member_public_profile(uuid) to authenticated;

-- A later migration had accidentally removed admin_assistant from this list.
-- Keep chat identity limited to the explicit, safe fields below.
create or replace function private.get_chat_sender_profiles(p_member_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_caller_status text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Login diperlukan' using errcode = '42501';
  end if;

  select p.status into v_caller_status
  from public.member_profiles p
  where p.id = v_user_id;

  if v_caller_status is distinct from 'active' then
    raise exception 'Hanya anggota aktif yang dapat melihat identitas chat' using errcode = '42501';
  end if;

  if coalesce(cardinality(p_member_ids), 0) > 200 then
    raise exception 'Maksimal 200 profil chat per permintaan' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'role', p.role,
      'rank_code', p.rank_code,
      'profile_photo_path', p.profile_photo_path,
      'created_at', p.created_at
    )),
    '[]'::jsonb
  )
  into v_result
  from public.member_profiles p
  where p.id = any(coalesce(p_member_ids, array[]::uuid[]))
    and p.status = 'active'
    and p.role in ('member', 'admin', 'admin_assistant');

  return v_result;
end;
$function$;

revoke all on function private.get_chat_sender_profiles(uuid[]) from public, anon, authenticated;
grant execute on function private.get_chat_sender_profiles(uuid[]) to authenticated;

create or replace function public.get_chat_sender_profiles(p_member_ids uuid[])
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $function$
  select private.get_chat_sender_profiles(p_member_ids);
$function$;

revoke all on function public.get_chat_sender_profiles(uuid[]) from public, anon;
grant execute on function public.get_chat_sender_profiles(uuid[]) to authenticated;
