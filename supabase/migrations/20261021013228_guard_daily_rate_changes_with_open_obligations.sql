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
    raise exception 'Akses admin diperlukan' using errcode='42501';
  end if;
  if p_daily_amount is null or p_daily_amount<=0 or p_daily_amount>1000000 or p_daily_amount<>trunc(p_daily_amount) then
    raise exception 'Tarif harian harus bilangan bulat positif yang valid' using errcode='22023';
  end if;
  if p_adm_default is null or p_adm_default<0 or p_adm_default>100000000 or p_adm_default<>trunc(p_adm_default) then
    raise exception 'Nilai ADM harus bilangan bulat nol atau lebih' using errcode='22023';
  end if;
  select * into v_old from public.dues_settings where id=1 for update;
  if not found then raise exception 'Pengaturan kas tidak ditemukan' using errcode='P0002'; end if;

  if p_daily_amount<>v_old.daily_amount and exists(
    select 1 from public.member_wallets w
    join public.member_profiles p on p.id=w.member_id
    where p.status='active'
      and (w.balance>0 or w.arrears>0 or w.next_pay>v_old.report_date)
  ) then
    raise exception 'Tarif harian tidak dapat diubah saat masih ada saldo prabayar, tunggakan, atau NextPay masa depan; rekonsiliasi dulu agar kewajiban lama tidak dihitung ulang' using errcode='55000';
  end if;

  update public.dues_settings set daily_amount=p_daily_amount,adm_default=p_adm_default where id=1;
  insert into public.dues_rate_history(effective_from,daily_amount,created_by)
  values(v_old.report_date,p_daily_amount,v_admin_id)
  on conflict(effective_from) do update
    set daily_amount=excluded.daily_amount,created_by=excluded.created_by,created_at=now();

  insert into public.admin_audit_log(admin_id,action,target_type,target_id,details)
  values(v_admin_id,'dues_settings_updated','dues_settings','1',
    jsonb_build_object('before',jsonb_build_object('daily_amount',v_old.daily_amount,'adm_default',v_old.adm_default),
      'after',jsonb_build_object('daily_amount',p_daily_amount,'adm_default',p_adm_default),
      'effective_from',v_old.report_date));
  return jsonb_build_object('success',true,'daily_amount',p_daily_amount,'adm_default',p_adm_default);
end;
$$;
revoke all on function private.admin_update_settings(numeric,numeric) from public, anon;
grant execute on function private.admin_update_settings(numeric,numeric) to authenticated;
