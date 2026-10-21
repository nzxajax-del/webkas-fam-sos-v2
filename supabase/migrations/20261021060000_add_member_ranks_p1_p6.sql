-- P1-P6 member ranks. Safe to re-run after direct project application.
alter table public.member_profiles
  add column if not exists rank_code text not null default 'P1';

alter table public.member_profiles
  drop constraint if exists member_profiles_rank_code_check;
alter table public.member_profiles
  add constraint member_profiles_rank_code_check
  check (rank_code in ('P1','P2','P3','P4','P5','P6'));

create or replace function private.admin_set_member_rank(p_member_id uuid, p_rank_code text)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog'
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_member public.member_profiles%rowtype;
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode = '42501';
  end if;
  if p_rank_code is null or p_rank_code not in ('P1','P2','P3','P4','P5','P6') then
    raise exception 'Pangkat harus P1 sampai P6' using errcode = '22023';
  end if;
  select * into v_member from public.member_profiles where id = p_member_id for update;
  if not found or v_member.role <> 'member' then
    raise exception 'Anggota tidak ditemukan' using errcode = 'P0002';
  end if;
  update public.member_profiles set rank_code = p_rank_code where id = p_member_id;
  insert into public.admin_audit_log(admin_id, action, target_type, target_id, details)
  values (v_admin_id, 'member_rank_changed', 'member_profile', p_member_id::text,
    jsonb_build_object('before',jsonb_build_object('rank_code',v_member.rank_code),
                       'after',jsonb_build_object('rank_code',p_rank_code)));
  return jsonb_build_object('success',true,'member_id',p_member_id,'rank_code',p_rank_code);
end;
$function$;

revoke all on function private.admin_set_member_rank(uuid,text) from public, anon;
grant execute on function private.admin_set_member_rank(uuid,text) to authenticated;

create or replace function public.admin_set_member_rank(p_member_id uuid, p_rank_code text)
returns jsonb
language sql
set search_path = 'pg_catalog'
as $function$
  select private.admin_set_member_rank(p_member_id,p_rank_code);
$function$;
revoke all on function public.admin_set_member_rank(uuid,text) from public, anon;
grant execute on function public.admin_set_member_rank(uuid,text) to authenticated;
