create or replace function private.admin_update_member(
  p_member_id uuid,
  p_display_name text,
  p_exempt_kas boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_member public.member_profiles%rowtype;
  v_wallet public.member_wallets%rowtype;
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode = '42501';
  end if;
  if p_exempt_kas is null then
    raise exception 'Status pengecualian KAS tidak valid' using errcode = '22023';
  end if;

  select * into v_member
  from public.member_profiles
  where id = p_member_id
  for update;
  if not found or v_member.role <> 'member' then
    raise exception 'Anggota tidak ditemukan' using errcode = 'P0002';
  end if;

  select * into v_wallet
  from public.member_wallets
  where member_id = p_member_id
  for update;
  if not found then
    raise exception 'Dompet anggota tidak ditemukan' using errcode = 'P0002';
  end if;

  -- Admins may adjust KAS exemption, but never change a member's display name.
  update public.member_wallets
  set exempt_kas = p_exempt_kas
  where member_id = p_member_id;

  insert into public.admin_audit_log(admin_id, action, target_type, target_id, details)
  values (
    v_admin_id, 'member_cash_exemption_updated', 'member_profile', p_member_id::text,
    jsonb_build_object(
      'display_name', v_member.display_name,
      'before_exempt_kas', v_wallet.exempt_kas,
      'after_exempt_kas', p_exempt_kas
    )
  );

  return jsonb_build_object(
    'success', true,
    'member_id', p_member_id,
    'display_name', v_member.display_name,
    'exempt_kas', p_exempt_kas
  );
end;
$function$;

create or replace function public.set_my_display_name(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_profile public.member_profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'Login diperlukan' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) < 1 or length(v_name) > 80 then
    raise exception 'Nama karakter harus 1–80 karakter' using errcode = '22023';
  end if;

  select * into v_profile
  from public.member_profiles
  where id = v_user_id
  for update;
  if not found or v_profile.status <> 'active' or v_profile.role not in ('member', 'admin') then
    raise exception 'Akun aktif tidak ditemukan' using errcode = '42501';
  end if;

  update public.member_profiles
  set display_name = v_name
  where id = v_user_id;

  return jsonb_build_object('success', true, 'display_name', v_name);
end;
$function$;

revoke all on function public.set_my_display_name(text) from public, anon;
grant execute on function public.set_my_display_name(text) to authenticated;
