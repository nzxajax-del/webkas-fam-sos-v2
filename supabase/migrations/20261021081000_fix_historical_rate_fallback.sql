-- Preserve the earliest known tariff for dates before the first effective_from row.
create or replace function private.process_daily_dues_internal(p_through_date date)
returns integer
language plpgsql
security definer
set search_path = 'pg_catalog'
as $function$
declare
  v_profile public.member_profiles%rowtype;
  v_wallet public.member_wallets%rowtype;
  v_due_date date;
  v_rate numeric(12,2);
  v_deducted numeric(12,2);
  v_added numeric(12,2);
  v_outcome text;
  v_processed integer := 0;
begin
  if p_through_date is null then
    raise exception 'Tanggal proses tidak boleh kosong' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('webkas_daily_dues_processor'));

  for v_profile in
    select * from public.member_profiles
    where status='active' and dues_start_date is not null and dues_start_date<=p_through_date
    order by id
  loop
    select * into v_wallet from public.member_wallets
    where member_id=v_profile.id for update;
    if not found then raise exception 'Dompet anggota % tidak ditemukan', v_profile.id using errcode='P0002'; end if;

    for v_due_date in
      select g::date from generate_series(v_profile.dues_start_date::timestamp,p_through_date::timestamp,interval '1 day') as g
    loop
      if exists(select 1 from public.daily_dues_log l where l.member_id=v_profile.id and l.due_date=v_due_date) then continue; end if;
      if exists(select 1 from public.daily_dues_log l where l.member_id=v_profile.id and l.due_date>v_due_date) then
        raise exception 'Celah histori tagihan ditemukan untuk anggota % pada tanggal %; rekonsiliasi manual diperlukan', v_profile.id, v_due_date using errcode='55000';
      end if;

      select h.daily_amount into v_rate from public.dues_rate_history h
      where h.effective_from<=v_due_date order by h.effective_from desc limit 1;
      if v_rate is null then
        select h.daily_amount into v_rate from public.dues_rate_history h
        order by h.effective_from asc limit 1;
      end if;
      if v_rate is null then select daily_amount into v_rate from public.dues_settings where id=1; end if;
      if v_rate is null or v_rate<=0 then
        raise exception 'Tarif iuran harian tidak valid untuk tanggal %',v_due_date using errcode='22023';
      end if;

      if v_wallet.exempt_kas then
        insert into public.daily_dues_log(member_id,due_date,daily_amount,balance_deducted,arrears_added,outcome)
        values(v_profile.id,v_due_date,v_rate,0,0,'exempt');
        v_processed:=v_processed+1;
        continue;
      end if;

      v_deducted := least(greatest(v_wallet.balance,0),v_rate);
      v_added := v_rate-v_deducted;
      update public.member_wallets
      set balance=balance-v_deducted,
          arrears=arrears+v_added,
          unpaid_from=case when v_added>0 then coalesce(unpaid_from,v_due_date)
                           when arrears+v_added=0 then null else unpaid_from end,
          updated_at=now()
      where member_id=v_profile.id;

      if v_deducted>0 then
        insert into public.wallet_transactions(member_id,transaction_type,amount,description)
        values(v_profile.id,'daily_deduction',v_deducted,'Iuran harian '||v_due_date::text);
      end if;
      if v_added>0 then
        insert into public.wallet_transactions(member_id,transaction_type,amount,description)
        values(v_profile.id,'arrears_accrual',v_added,'Tunggakan iuran '||v_due_date::text);
      end if;
      v_outcome:=case when v_added>0 then 'arrears' else 'deducted' end;
      insert into public.daily_dues_log(member_id,due_date,daily_amount,balance_deducted,arrears_added,outcome)
      values(v_profile.id,v_due_date,v_rate,v_deducted,v_added,v_outcome);
      v_processed:=v_processed+1;
      select * into v_wallet from public.member_wallets where member_id=v_profile.id;
    end loop;
  end loop;
  return v_processed;
end;
$function$;
