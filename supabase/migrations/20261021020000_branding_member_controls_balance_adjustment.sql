-- Configurable family branding, safe member deactivation, and audited prepaid-balance adjustments.
create table if not exists public.app_branding_settings (
  id smallint primary key default 1 check (id = 1),
  site_name text not null default 'WEBKAS FAM SOS V2' check (length(btrim(site_name)) between 3 and 80),
  family_name text not null default 'FAM SOS' check (length(btrim(family_name)) between 2 and 60),
  subtitle text not null default 'CATATAN KAS KELUARGA' check (length(btrim(subtitle)) between 2 and 80),
  accent_color text not null default '#c1f45a' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  background_color text not null default '#0b0e0b' check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.app_branding_settings(id) values (1) on conflict (id) do nothing;
alter table public.app_branding_settings enable row level security;
revoke all on public.app_branding_settings from public, anon, authenticated;
grant select on public.app_branding_settings to anon, authenticated;
drop policy if exists app_branding_public_read on public.app_branding_settings;
create policy app_branding_public_read on public.app_branding_settings for select to anon, authenticated using (id = 1);

create or replace function private.admin_update_branding(
  p_site_name text, p_family_name text, p_subtitle text,
  p_accent_color text, p_background_color text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_admin_id uuid := auth.uid(); v_old public.app_branding_settings%rowtype;
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_site_name,''))) not between 3 and 80
     or length(btrim(coalesce(p_family_name,''))) not between 2 and 60
     or length(btrim(coalesce(p_subtitle,''))) not between 2 and 80
     or p_accent_color !~ '^#[0-9A-Fa-f]{6}$'
     or p_background_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Identitas atau warna tidak valid' using errcode = '22023';
  end if;
  select * into v_old from public.app_branding_settings where id=1 for update;
  update public.app_branding_settings set site_name=btrim(p_site_name), family_name=btrim(p_family_name),
    subtitle=btrim(p_subtitle), accent_color=lower(p_accent_color), background_color=lower(p_background_color),
    updated_by=v_admin_id, updated_at=now() where id=1;
  insert into public.admin_audit_log(admin_id,action,target_type,target_id,details)
  values(v_admin_id,'branding_updated','app_branding_settings','1',
    jsonb_build_object('before',jsonb_build_object('site_name',v_old.site_name,'family_name',v_old.family_name,'subtitle',v_old.subtitle,'accent_color',v_old.accent_color,'background_color',v_old.background_color),
      'after',jsonb_build_object('site_name',btrim(p_site_name),'family_name',btrim(p_family_name),'subtitle',btrim(p_subtitle),'accent_color',lower(p_accent_color),'background_color',lower(p_background_color))));
  return jsonb_build_object('success',true);
end; $$;
revoke all on function private.admin_update_branding(text,text,text,text,text) from public, anon;
grant execute on function private.admin_update_branding(text,text,text,text,text) to authenticated;
create or replace function public.admin_update_branding(
  p_site_name text, p_family_name text, p_subtitle text,
  p_accent_color text, p_background_color text
) returns jsonb language sql security invoker set search_path = pg_catalog as $$
  select private.admin_update_branding(p_site_name,p_family_name,p_subtitle,p_accent_color,p_background_color);
$$;
revoke all on function public.admin_update_branding(text,text,text,text,text) from public, anon;
grant execute on function public.admin_update_branding(text,text,text,text,text) to authenticated;

alter table public.member_profiles drop constraint if exists member_profiles_status_check;
alter table public.member_profiles add constraint member_profiles_status_check
  check (status = any (array['pending','active','rejected','inactive']));

create or replace function private.admin_set_member_status(p_member_id uuid, p_status text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_admin_id uuid := auth.uid(); v_member public.member_profiles%rowtype;
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode = '42501';
  end if;
  if p_status not in ('active','inactive') then
    raise exception 'Status hanya boleh aktif atau nonaktif' using errcode = '22023';
  end if;
  select * into v_member from public.member_profiles where id=p_member_id for update;
  if not found or v_member.role <> 'member' or v_member.status not in ('active','inactive') then
    raise exception 'Hanya akun anggota aktif/nonaktif yang dapat diubah' using errcode = 'P0002';
  end if;
  update public.member_profiles set status=p_status, updated_at=now() where id=p_member_id;
  insert into public.admin_audit_log(admin_id,action,target_type,target_id,details)
  values(v_admin_id,'member_status_changed','member_profile',p_member_id::text,
    jsonb_build_object('username',v_member.login_username,'before',v_member.status,'after',p_status,'reason',left(coalesce(btrim(p_reason),''),500)));
  return jsonb_build_object('success',true,'member_id',p_member_id,'status',p_status);
end; $$;
revoke all on function private.admin_set_member_status(uuid,text,text) from public, anon;
grant execute on function private.admin_set_member_status(uuid,text,text) to authenticated;
create or replace function public.admin_set_member_status(p_member_id uuid, p_status text, p_reason text default null)
returns jsonb language sql security invoker set search_path = pg_catalog as $$
  select private.admin_set_member_status(p_member_id,p_status,p_reason);
$$;
revoke all on function public.admin_set_member_status(uuid,text,text) from public, anon;
grant execute on function public.admin_set_member_status(uuid,text,text) to authenticated;

create or replace function private.admin_adjust_member_balance(p_member_id uuid, p_delta numeric, p_reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_admin_id uuid := auth.uid(); v_member public.member_profiles%rowtype; v_wallet public.member_wallets%rowtype;
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 1000000000 or p_delta <> trunc(p_delta,2)
     or length(btrim(coalesce(p_reason,''))) < 5 or length(btrim(p_reason)) > 500 then
    raise exception 'Nominal koreksi atau alasan tidak valid' using errcode = '22023';
  end if;
  select * into v_member from public.member_profiles where id=p_member_id for update;
  if not found or v_member.role <> 'member' then raise exception 'Anggota tidak ditemukan' using errcode = 'P0002'; end if;
  select * into v_wallet from public.member_wallets where member_id=p_member_id for update;
  if not found then raise exception 'Dompet anggota tidak ditemukan' using errcode = 'P0002'; end if;
  if v_wallet.balance + p_delta < 0 then raise exception 'Saldo tidak boleh menjadi negatif' using errcode = '22023'; end if;
  update public.member_wallets set balance=balance+p_delta, updated_at=now() where member_id=p_member_id;
  insert into public.wallet_transactions(member_id,transaction_type,amount,description,created_by)
  values(p_member_id,'admin_adjustment',abs(p_delta),
    'Koreksi saldo oleh admin (' || case when p_delta > 0 then '+' else '-' end || p_delta::text || '): ' || btrim(p_reason),v_admin_id);
  insert into public.admin_audit_log(admin_id,action,target_type,target_id,details)
  values(v_admin_id,'member_balance_adjusted','member_wallet',p_member_id::text,
    jsonb_build_object('username',v_member.login_username,'delta',p_delta,'before_balance',v_wallet.balance,'after_balance',v_wallet.balance+p_delta,'reason',btrim(p_reason)));
  return jsonb_build_object('success',true,'member_id',p_member_id,'balance',v_wallet.balance+p_delta);
end; $$;
revoke all on function private.admin_adjust_member_balance(uuid,numeric,text) from public, anon;
grant execute on function private.admin_adjust_member_balance(uuid,numeric,text) to authenticated;
create or replace function public.admin_adjust_member_balance(p_member_id uuid,p_delta numeric,p_reason text)
returns jsonb language sql security invoker set search_path = pg_catalog as $$
  select private.admin_adjust_member_balance(p_member_id,p_delta,p_reason);
$$;
revoke all on function public.admin_adjust_member_balance(uuid,numeric,text) from public, anon;
grant execute on function public.admin_adjust_member_balance(uuid,numeric,text) to authenticated;
