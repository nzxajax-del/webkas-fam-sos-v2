create or replace function public.process_daily_dues(p_through_date date default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_report_date date;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_target date;
  v_enabled boolean;
  v_processed integer := 0;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' and session_user <> 'postgres' then
    raise exception 'Pemrosesan harian hanya untuk service role atau scheduler database tepercaya' using errcode='42501';
  end if;
  select report_date,cash_operations_enabled into v_report_date,v_enabled
  from public.dues_settings where id=1;
  if not coalesce(v_enabled,false) then
    raise exception 'Pemrosesan harian dinonaktifkan sampai seluruh tes regresi kas/NextPay lulus' using errcode='55000';
  end if;

  if p_through_date is null then
    if v_report_date>v_today then
      raise exception 'Tanggal rekap berada di masa depan; rekonsiliasi manual diperlukan' using errcode='55000';
    end if;
    v_target:=v_today-1;
    v_processed:=private.process_daily_dues_internal(v_target);
    if v_report_date<v_today then
      update public.dues_settings set report_date=v_today where id=1;
      insert into public.admin_audit_log(admin_id,action,target_type,target_id,details)
      values(null,'report_date_auto_advanced','dues_settings','1',
        jsonb_build_object('from',v_report_date,'to',v_today,'daily_log_rows_created',v_processed,'timezone','Asia/Jakarta'));
    end if;
    return v_processed;
  end if;

  v_target:=p_through_date;
  if v_target>v_today-1 then
    raise exception 'Tanggal proses harus sebelum hari ini menurut WIB' using errcode='22023';
  end if;
  return private.process_daily_dues_internal(v_target);
end;
$$;
revoke all on function public.process_daily_dues(date) from public, anon, authenticated;
grant execute on function public.process_daily_dues(date) to service_role;
