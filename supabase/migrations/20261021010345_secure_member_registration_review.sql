-- Registration review is a privileged action and cannot be performed by editing profiles directly.
revoke update on table public.member_profiles from authenticated;
drop policy if exists member_profiles_admin_update on public.member_profiles;

create or replace function private.review_member_registration(
  p_member_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_id uuid := auth.uid();
  v_member public.member_profiles%rowtype;
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode = '42501';
  end if;
  if p_decision not in ('active','rejected') then
    raise exception 'Keputusan pendaftaran tidak valid' using errcode = '22023';
  end if;

  select * into v_member from public.member_profiles
  where id = p_member_id for update;
  if not found then
    raise exception 'Pendaftaran anggota tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_member.role <> 'member' or v_member.status <> 'pending' then
    raise exception 'Pendaftaran ini bukan anggota yang sedang menunggu' using errcode = '55000';
  end if;

  update public.member_profiles set status = p_decision where id = p_member_id;

  insert into public.admin_audit_log(admin_id,action,target_type,target_id,details)
  values(v_admin_id,case when p_decision='active' then 'member_registration_approved' else 'member_registration_rejected' end,
         'member_profile',p_member_id::text,
         jsonb_build_object('display_name',v_member.display_name,'login_username',v_member.login_username,
                            'note',nullif(btrim(coalesce(p_note,'')),'')));

  return jsonb_build_object('success',true,'member_id',p_member_id,'status',p_decision);
end;
$$;
revoke all on function private.review_member_registration(uuid,text,text) from public, anon;
grant execute on function private.review_member_registration(uuid,text,text) to authenticated;

create or replace function public.review_member_registration(
  p_member_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$
  select private.review_member_registration(p_member_id,p_decision,p_note);
$$;
revoke all on function public.review_member_registration(uuid,text,text) from public, anon;
grant execute on function public.review_member_registration(uuid,text,text) to authenticated;
