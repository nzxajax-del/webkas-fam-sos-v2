alter table public.dues_settings
  add column if not exists proof_retention_days integer not null default 7
  check (proof_retention_days in (3,7,30));

create or replace function private.admin_update_proof_retention(p_days integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_id uuid:=auth.uid();
  v_old integer;
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode='42501';
  end if;
  if p_days not in (3,7,30) then
    raise exception 'Retensi bukti harus 3, 7, atau 30 hari' using errcode='22023';
  end if;
  select proof_retention_days into v_old from public.dues_settings where id=1 for update;
  if not found then raise exception 'Pengaturan kas tidak ditemukan' using errcode='P0002'; end if;
  update public.dues_settings set proof_retention_days=p_days where id=1;
  insert into public.admin_audit_log(admin_id,action,target_type,target_id,details)
  values(v_admin_id,'proof_retention_updated','dues_settings','1',
    jsonb_build_object('before_days',v_old,'after_days',p_days));
  return jsonb_build_object('success',true,'proof_retention_days',p_days);
end;
$$;
revoke all on function private.admin_update_proof_retention(integer) from public, anon;
grant execute on function private.admin_update_proof_retention(integer) to authenticated;

create or replace function public.admin_update_proof_retention(p_days integer)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$ select private.admin_update_proof_retention(p_days); $$;
revoke all on function public.admin_update_proof_retention(integer) from public, anon;
grant execute on function public.admin_update_proof_retention(integer) to authenticated;
