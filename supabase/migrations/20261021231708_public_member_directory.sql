create or replace function private.get_public_member_directory()
returns table (
  id uuid,
  display_name text,
  login_username text,
  rank_code text,
  profile_photo_path text
)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_caller_status text;
  v_caller_role text;
begin
  if v_user_id is null then
    raise exception 'Login diperlukan' using errcode = '42501';
  end if;

  select p.status, p.role
    into v_caller_status, v_caller_role
  from public.member_profiles p
  where p.id = v_user_id;

  if v_caller_status is distinct from 'active'
     or v_caller_role not in ('member', 'admin', 'admin_assistant') then
    raise exception 'Hanya anggota aktif yang dapat melihat daftar anggota' using errcode = '42501';
  end if;

  return query
  select p.id, p.display_name, p.login_username, p.rank_code, p.profile_photo_path
  from public.member_profiles p
  where p.status = 'active'
    and p.role in ('member', 'admin', 'admin_assistant')
  order by
    case p.rank_code
      when 'P6' then 1
      when 'P5' then 2
      when 'P4' then 3
      when 'P7' then 4
      when 'P3' then 5
      when 'P2' then 6
      when 'P1' then 7
      else 8
    end,
    lower(coalesce(p.display_name, ''));
end;
$function$;

revoke all on function private.get_public_member_directory() from public, anon;
grant execute on function private.get_public_member_directory() to authenticated;

create or replace function public.get_public_member_directory()
returns table (
  id uuid,
  display_name text,
  login_username text,
  rank_code text,
  profile_photo_path text
)
language sql
stable
security invoker
set search_path to 'pg_catalog'
as $function$
  select * from private.get_public_member_directory();
$function$;

revoke all on function public.get_public_member_directory() from public, anon;
grant execute on function public.get_public_member_directory() to authenticated;
