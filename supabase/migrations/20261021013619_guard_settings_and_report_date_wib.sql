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
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
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
  if v_old.report_date<>v_today then
    raise exception 'Tanggal rekap belum sesuai tanggal WIB hari ini; jalankan catch-up terlebih dahulu sebelum mengubah tarif' using errcode='55000';
  end if;

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

create or replace function private.admin_set_report_date(p_report_date date)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_id uuid:=auth.uid();
  v_old_date date;
  v_enabled boolean;
  v_processed integer:=0;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode='42501';
  end if;
  if p_report_date is null then raise exception 'Tanggal rekap tidak valid' using errcode='22023'; end if;
  if p_report_date>v_today then
    raise exception 'Tanggal rekap tidak boleh di masa depan menurut WIB' using errcode='22023';
  end if;
  select report_date,cash_operations_enabled into v_old_date,v_enabled from public.dues_settings where id=1 for update;
  if p_report_date<v_old_date then
    raise exception 'Tanggal rekap tidak boleh mundur karena histori kas tidak dapat dibatalkan otomatis' using errcode='22023';
  end if;
  if p_report_date=v_old_date then
    return jsonb_build_object('success',true,'report_date',v_old_date,'processed',0);
  end if;
  if not v_enabled then
    raise exception 'Perubahan tanggal dikunci sampai pengujian kas dan NextPay lulus' using errcode='55000';
  end if;
  v_processed:=private.process_daily_dues_internal(p_report_date-1);
  update public.dues_settings set report_date=p_report_date where id=1;
  insert into public.admin_audit_log(admin_id,action,target_type,target_id,details)
  values(v_admin_id,'report_date_advanced','dues_settings','1',
    jsonb_build_object('from',v_old_date,'to',p_report_date,'daily_log_rows_created',v_processed));
  return jsonb_build_object('success',true,'report_date',p_report_date,'processed',v_processed);
end;
$$;
revoke all on function private.admin_set_report_date(date) from public, anon;
grant execute on function private.admin_set_report_date(date) to authenticated;
