-- Admin console foundation: audited member metadata and settings RPC.
create index if not exists admin_bootstrap_tokens_used_by_idx
  on private.admin_bootstrap_tokens (used_by)
  where used_by is not null;

create or replace function private.admin_update_settings(
  p_daily_amount numeric,
  p_adm_default numeric
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_id uuid := auth.uid();
  v_old public.dues_settings%rowtype;
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode = '42501';
  end if;
  if p_daily_amount is null or p_daily_amount <= 0 or p_daily_amount > 1000000
     or p_daily_amount <> trunc(p_daily_amount) then
    raise exception 'Tarif harian harus bilangan bulat positif yang valid' using errcode = '22023';
  end if;
  if p_adm_default is null or p_adm_default < 0 or p_adm_default > 100000000
     or p_adm_default <> trunc(p_adm_default) then
    raise exception 'Nilai ADM harus bilangan bulat nol atau lebih' using errcode = '22023';
  end if;

  select * into v_old from public.dues_settings where id = 1 for update;
  if not found then raise exception 'Pengaturan kas tidak ditemukan' using errcode = 'P0002'; end if;

  update public.dues_settings
  set daily_amount = p_daily_amount,
      adm_default = p_adm_default
  where id = 1;

  insert into public.admin_audit_log(admin_id, action, target_type, target_id, details)
  values (
    v_admin_id, 'dues_settings_updated', 'dues_settings', '1',
    jsonb_build_object(
      'before', jsonb_build_object('daily_amount',v_old.daily_amount,'adm_default',v_old.adm_default),
      'after', jsonb_build_object('daily_amount',p_daily_amount,'adm_default',p_adm_default),
      'report_date_unchanged', v_old.report_date
    )
  );

  return jsonb_build_object('success',true,'daily_amount',p_daily_amount,'adm_default',p_adm_default);
end;
$$;
revoke all on function private.admin_update_settings(numeric,numeric) from public, anon;
grant execute on function private.admin_update_settings(numeric,numeric) to authenticated;

create or replace function public.admin_update_settings(
  p_daily_amount numeric,
  p_adm_default numeric
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$
  select private.admin_update_settings(p_daily_amount,p_adm_default);
$$;
revoke all on function public.admin_update_settings(numeric,numeric) from public, anon;
grant execute on function public.admin_update_settings(numeric,numeric) to authenticated;

create or replace function private.admin_update_member(
  p_member_id uuid,
  p_display_name text,
  p_exempt_kas boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_id uuid := auth.uid();
  v_member public.member_profiles%rowtype;
  v_wallet public.member_wallets%rowtype;
  v_name text := nullif(btrim(coalesce(p_display_name,'')),'');
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) < 1 or length(v_name) > 80 then
    raise exception 'Nama anggota harus 1–80 karakter' using errcode = '22023';
  end if;
  if p_exempt_kas is null then
    raise exception 'Status pengecualian KAS tidak valid' using errcode = '22023';
  end if;

  select * into v_member from public.member_profiles where id = p_member_id for update;
  if not found or v_member.role <> 'member' then
    raise exception 'Anggota tidak ditemukan' using errcode = 'P0002';
  end if;
  select * into v_wallet from public.member_wallets where member_id = p_member_id for update;
  if not found then raise exception 'Dompet anggota tidak ditemukan' using errcode = 'P0002'; end if;

  update public.member_profiles set display_name = v_name where id = p_member_id;
  update public.member_wallets set exempt_kas = p_exempt_kas where member_id = p_member_id;

  insert into public.admin_audit_log(admin_id, action, target_type, target_id, details)
  values (
    v_admin_id, 'member_profile_updated', 'member_profile', p_member_id::text,
    jsonb_build_object(
      'before', jsonb_build_object('display_name',v_member.display_name,'exempt_kas',v_wallet.exempt_kas),
      'after', jsonb_build_object('display_name',v_name,'exempt_kas',p_exempt_kas)
    )
  );
  return jsonb_build_object('success',true,'member_id',p_member_id,'display_name',v_name,'exempt_kas',p_exempt_kas);
end;
$$;
revoke all on function private.admin_update_member(uuid,text,boolean) from public, anon;
grant execute on function private.admin_update_member(uuid,text,boolean) to authenticated;

create or replace function public.admin_update_member(
  p_member_id uuid,
  p_display_name text,
  p_exempt_kas boolean
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$
  select private.admin_update_member(p_member_id,p_display_name,p_exempt_kas);
$$;
revoke all on function public.admin_update_member(uuid,text,boolean) from public, anon;
grant execute on function public.admin_update_member(uuid,text,boolean) to authenticated;
