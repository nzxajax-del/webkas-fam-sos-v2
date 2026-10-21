create or replace function public.process_daily_dues(p_through_date date default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_report_date date;
  v_target date;
  v_enabled boolean;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Pemrosesan harian hanya untuk service role terjadwal' using errcode='42501';
  end if;
  select report_date,cash_operations_enabled into v_report_date,v_enabled
  from public.dues_settings where id=1;
  if not coalesce(v_enabled,false) then
    raise exception 'Pemrosesan harian dinonaktifkan sampai seluruh tes regresi kas/NextPay lulus' using errcode='55000';
  end if;
  v_target:=coalesce(p_through_date,v_report_date-1);
  if v_target>v_report_date-1 then
    raise exception 'Tanggal proses harus sebelum tanggal rekap' using errcode='22023';
  end if;
  return private.process_daily_dues_internal(v_target);
end;
$$;
revoke all on function public.process_daily_dues(date) from public, anon, authenticated;
grant execute on function public.process_daily_dues(date) to service_role;
