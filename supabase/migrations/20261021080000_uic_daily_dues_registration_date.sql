-- UIC-based cash ledger rules, registration-date dues, and next-day tariff changes.
-- Intentionally keeps cash_operations_enabled locked until regression checks pass.

create or replace function private.initialize_member_dues_start()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog'
as $function$
begin
  if new.status = 'active' and old.status is distinct from new.status then
    -- Registration date, in WIB, is the first chargeable date.
    new.dues_start_date := coalesce(
      new.dues_start_date,
      (new.created_at at time zone 'Asia/Jakarta')::date
    );
    -- next_pay is a legacy column and is no longer used for charging.
  end if;
  return new;
end;
$function$;

-- Fill a missing start date only; never rewrite an existing financial history anchor.
update public.member_profiles
set dues_start_date = (created_at at time zone 'Asia/Jakarta')::date
where status = 'active' and dues_start_date is null;

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

  -- Serialize scheduled runs and catch-up calls to prevent concurrent duplicate processing.
  perform pg_advisory_xact_lock(hashtext('webkas_daily_dues_processor'));

  for v_profile in
    select * from public.member_profiles
    where status='active' and dues_start_date is not null and dues_start_date<=p_through_date
    order by id
  loop
    select * into v_wallet from public.member_wallets
    where member_id=v_profile.id for update;
    if not found then
      raise exception 'Dompet anggota % tidak ditemukan', v_profile.id using errcode='P0002';
    end if;

    for v_due_date in
      select g::date
      from generate_series(v_profile.dues_start_date::timestamp,p_through_date::timestamp,interval '1 day') as g
    loop
      if exists(select 1 from public.daily_dues_log l where l.member_id=v_profile.id and l.due_date=v_due_date) then
        continue;
      end if;
      if exists(select 1 from public.daily_dues_log l where l.member_id=v_profile.id and l.due_date>v_due_date) then
        raise exception 'Celah histori tagihan ditemukan untuk anggota % pada tanggal %; rekonsiliasi manual diperlukan', v_profile.id, v_due_date using errcode='55000';
      end if;

      select h.daily_amount into v_rate
      from public.dues_rate_history h
      where h.effective_from<=v_due_date
      order by h.effective_from desc limit 1;
      if v_rate is null then
        select daily_amount into v_rate from public.dues_settings where id=1;
      end if;
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
      set balance = balance-v_deducted,
          arrears = arrears+v_added,
          unpaid_from = case
            when v_added>0 then coalesce(unpaid_from,v_due_date)
            when arrears+v_added=0 then null
            else unpaid_from
          end,
          updated_at = now()
      where member_id=v_profile.id;

      if v_deducted>0 then
        insert into public.wallet_transactions(member_id,transaction_type,amount,description)
        values(v_profile.id,'daily_deduction',v_deducted,'Iuran harian '||v_due_date::text);
      end if;
      if v_added>0 then
        insert into public.wallet_transactions(member_id,transaction_type,amount,description)
        values(v_profile.id,'arrears_accrual',v_added,'Tunggakan iuran '||v_due_date::text);
      end if;

      v_outcome := case when v_added>0 then 'arrears' else 'deducted' end;
      insert into public.daily_dues_log(member_id,due_date,daily_amount,balance_deducted,arrears_added,outcome)
      values(v_profile.id,v_due_date,v_rate,v_deducted,v_added,v_outcome);

      v_processed := v_processed+1;
      select * into v_wallet from public.member_wallets where member_id=v_profile.id;
    end loop;
  end loop;
  return v_processed;
end;
$function$;

create or replace function private.review_payment(
  p_submission_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog'
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_submission public.payment_submissions%rowtype;
  v_wallet public.member_wallets%rowtype;
  v_report_date date;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_arrears_paid numeric(12,2):=0;
  v_balance_credit numeric(12,2):=0;
  v_new_arrears numeric(12,2);
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode='42501';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Keputusan tidak valid' using errcode='22023';
  end if;

  select * into v_submission from public.payment_submissions where id=p_submission_id for update;
  if not found then raise exception 'Pengajuan pembayaran tidak ditemukan' using errcode='P0002'; end if;
  if v_submission.status<>'pending' then raise exception 'Pengajuan ini sudah diproses' using errcode='55000'; end if;

  if p_decision='approved' then
    if v_submission.payment_type <> 'kas' then
      raise exception 'Jenis pembayaran ini sudah tidak didukung; ajukan pembayaran KAS dalam UIC' using errcode='22023';
    end if;
    if v_submission.amount is null or v_submission.amount<=0 or v_submission.amount<>trunc(v_submission.amount) then
      raise exception 'Nominal pembayaran harus bilangan bulat UIC yang positif' using errcode='22023';
    end if;

    select report_date into v_report_date from public.dues_settings where id=1;
    if v_report_date<>v_today then
      raise exception 'Tanggal rekap belum sesuai tanggal WIB hari ini; jalankan catch-up terjadwal sebelum menyetujui pembayaran' using errcode='55000';
    end if;
    perform private.process_daily_dues_internal(v_report_date-1);

    select * into v_wallet from public.member_wallets where member_id=v_submission.member_id for update;
    if not found then raise exception 'Dompet anggota tidak ditemukan' using errcode='P0002'; end if;

    v_arrears_paid := least(v_wallet.arrears,v_submission.amount);
    v_balance_credit := v_submission.amount-v_arrears_paid;
    v_new_arrears := v_wallet.arrears-v_arrears_paid;

    update public.member_wallets
    set arrears = v_new_arrears,
        balance = balance+v_balance_credit,
        unpaid_from = case when v_new_arrears=0 then null else unpaid_from end,
        updated_at = now()
    where member_id=v_submission.member_id;

    insert into public.wallet_transactions(member_id,transaction_type,amount,reference_id,description,created_by)
    values(v_submission.member_id,'payment_credit',v_submission.amount,v_submission.id,
      'Pembayaran UIC disetujui; tunggakan dilunasi '||v_arrears_paid::text||', masuk saldo '||v_balance_credit::text,v_admin_id);
  end if;

  update public.payment_submissions set status=p_decision,
    review_note=nullif(btrim(coalesce(p_note,'')),''),
    reviewed_by=v_admin_id,reviewed_at=now()
  where id=v_submission.id;

  insert into public.admin_audit_log(admin_id,action,target_type,target_id,details)
  values(v_admin_id,case when p_decision='approved' then 'payment_approved' else 'payment_rejected' end,
    'payment_submission',v_submission.id::text,
    jsonb_build_object('member_id',v_submission.member_id,'amount',v_submission.amount,
      'payment_type',v_submission.payment_type,'review_note',nullif(btrim(coalesce(p_note,'')),''),
      'arrears_paid',v_arrears_paid,'balance_credit',v_balance_credit));
  return jsonb_build_object('success',true,'submission_id',v_submission.id,'status',p_decision,
    'arrears_paid',v_arrears_paid,'balance_credit',v_balance_credit);
end;
$function$;

create or replace function private.admin_update_settings(p_daily_amount numeric, p_adm_default numeric)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog'
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_old public.dues_settings%rowtype;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_effective_from date := (now() at time zone 'Asia/Jakarta')::date + 1;
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode='42501';
  end if;
  if p_daily_amount is null or p_daily_amount<=0 or p_daily_amount>1000000 or p_daily_amount<>trunc(p_daily_amount) then
    raise exception 'Tarif harian harus bilangan bulat UIC positif yang valid' using errcode='22023';
  end if;

  select * into v_old from public.dues_settings where id=1 for update;
  if not found then raise exception 'Pengaturan kas tidak ditemukan' using errcode='P0002'; end if;
  if v_old.report_date<>v_today then
    raise exception 'Tanggal rekap belum sesuai tanggal WIB hari ini; jalankan catch-up terlebih dahulu sebelum mengubah tarif' using errcode='55000';
  end if;

  update public.dues_settings set daily_amount=p_daily_amount,adm_default=0 where id=1;
  insert into public.dues_rate_history(effective_from,daily_amount,created_by)
  values(v_effective_from,p_daily_amount,v_admin_id)
  on conflict(effective_from) do update
    set daily_amount=excluded.daily_amount,created_by=excluded.created_by,created_at=now();

  insert into public.admin_audit_log(admin_id,action,target_type,target_id,details)
  values(v_admin_id,'dues_settings_updated','dues_settings','1',
    jsonb_build_object('before',jsonb_build_object('daily_amount',v_old.daily_amount),
      'after',jsonb_build_object('daily_amount',p_daily_amount),
      'effective_from',v_effective_from,'timezone','Asia/Jakarta'));
  return jsonb_build_object('success',true,'daily_amount',p_daily_amount,'effective_from',v_effective_from);
end;
$function$;

-- Remove any prior daily processor job if present, then schedule catch-up at 00:01 WIB (17:01 UTC).
create extension if not exists pg_cron with schema pg_catalog;
do $schedule$
declare v_job record;
begin
  if to_regclass('cron.job') is not null then
    for v_job in execute 'select jobid from cron.job where jobname = ''webkas-daily-dues-wib''' loop
      execute format('select cron.unschedule(%s)',v_job.jobid);
    end loop;
    execute $cmd$select cron.schedule('webkas-daily-dues-wib','1 17 * * *','select public.process_daily_dues();')$cmd$;
  end if;
end;
$schedule$;

-- The production cash lock intentionally remains false until transactional tests pass.
