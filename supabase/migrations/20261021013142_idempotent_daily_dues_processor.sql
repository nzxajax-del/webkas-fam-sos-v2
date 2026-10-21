-- Daily dues engine with date-idempotency and effective-dated daily rates.
alter table public.member_profiles
  add column if not exists dues_start_date date;

create table if not exists public.dues_rate_history (
  effective_from date primary key,
  daily_amount numeric(12,2) not null check (daily_amount > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.dues_rate_history enable row level security;
revoke all on table public.dues_rate_history from public, anon, authenticated, service_role;

insert into public.dues_rate_history(effective_from,daily_amount)
select report_date,daily_amount from public.dues_settings where id=1
on conflict (effective_from) do nothing;

update public.member_profiles p
set dues_start_date = s.report_date
from public.dues_settings s
where s.id=1 and p.status='active' and p.dues_start_date is null;

create or replace function private.initialize_member_dues_start()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare v_report_date date;
begin
  if new.status='active' and old.status is distinct from new.status then
    select report_date into v_report_date from public.dues_settings where id=1;
    new.dues_start_date := coalesce(new.dues_start_date,v_report_date);
    update public.member_wallets
      set next_pay=coalesce(next_pay,new.dues_start_date)
      where member_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.initialize_member_dues_start() from public, anon, authenticated, service_role;
drop trigger if exists initialize_member_dues_start on public.member_profiles;
create trigger initialize_member_dues_start
before update of status on public.member_profiles
for each row execute function private.initialize_member_dues_start();

create or replace function private.process_daily_dues_internal(p_through_date date)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_profile public.member_profiles%rowtype;
  v_wallet public.member_wallets%rowtype;
  v_due_date date;
  v_rate numeric(12,2);
  v_deducted numeric(12,2);
  v_added numeric(12,2);
  v_outcome text;
  v_report_date date;
  v_processed integer := 0;
begin
  if p_through_date is null then
    raise exception 'Tanggal proses tidak boleh kosong' using errcode='22023';
  end if;
  select report_date into v_report_date from public.dues_settings where id=1;
  if not found then raise exception 'Pengaturan kas tidak ditemukan' using errcode='P0002'; end if;

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
        raise exception 'Tarif KAS harian tidak valid untuk tanggal %',v_due_date using errcode='22023';
      end if;

      if v_wallet.exempt_kas then
        insert into public.daily_dues_log(member_id,due_date,daily_amount,balance_deducted,arrears_added,outcome)
        values(v_profile.id,v_due_date,v_rate,0,0,'exempt');
        v_processed:=v_processed+1;
        continue;
      end if;

      v_deducted:=0;
      v_added:=0;
      if v_due_date < coalesce(v_wallet.next_pay,v_due_date) then
        -- This date was already covered by prepaid NextPay. Consume its matching prepaid wallet unit,
        -- but do not advance NextPay again: the payment that prepaid it already did so.
        if v_wallet.balance < v_rate then
          raise exception 'Saldo dan NextPay tidak konsisten untuk anggota % pada tanggal %; proses dihentikan agar tidak menggandakan tunggakan',v_profile.id,v_due_date using errcode='55000';
        end if;
        v_deducted:=v_rate;
        update public.member_wallets set balance=balance-v_deducted where member_id=v_profile.id;
      elsif v_wallet.balance >= v_rate then
        v_deducted:=v_rate;
        update public.member_wallets
        set balance=balance-v_deducted,
            next_pay=case when arrears=0
              then greatest(coalesce(next_pay,v_due_date),v_due_date)+1
              else next_pay end
        where member_id=v_profile.id;
      else
        v_deducted:=v_wallet.balance;
        v_added:=v_rate-v_deducted;
        update public.member_wallets
        set balance=0,
            arrears=arrears+v_added,
            unpaid_from=coalesce(unpaid_from,v_due_date),
            next_pay=coalesce(next_pay,v_due_date)
        where member_id=v_profile.id;
      end if;

      if v_deducted>0 then
        insert into public.wallet_transactions(member_id,transaction_type,amount,description)
        values(v_profile.id,'daily_deduction',v_deducted,'KAS harian tanggal '||v_due_date::text);
      end if;
      if v_added>0 then
        insert into public.wallet_transactions(member_id,transaction_type,amount,description)
        values(v_profile.id,'arrears_accrual',v_added,'Tunggakan KAS tanggal '||v_due_date::text);
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
$$;
revoke all on function private.process_daily_dues_internal(date) from public, anon, authenticated, service_role;

create or replace function public.process_daily_dues(p_through_date date default null)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_report_date date;
  v_target date;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'Pemrosesan harian hanya untuk service role terjadwal' using errcode='42501';
  end if;
  select report_date into v_report_date from public.dues_settings where id=1;
  v_target:=coalesce(p_through_date,v_report_date-1);
  if v_target>v_report_date-1 then
    raise exception 'Tanggal proses harus sebelum tanggal rekap' using errcode='22023';
  end if;
  return private.process_daily_dues_internal(v_target);
end;
$$;
revoke all on function public.process_daily_dues(date) from public, anon, authenticated;
grant execute on function public.process_daily_dues(date) to service_role;

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

  update public.dues_settings set daily_amount=p_daily_amount,adm_default=p_adm_default where id=1;
  insert into public.dues_rate_history(effective_from,daily_amount,created_by)
  values(v_old.report_date,p_daily_amount,v_admin_id)
  on conflict(effective_from) do update set daily_amount=excluded.daily_amount,created_by=excluded.created_by,created_at=now();

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

create or replace function public.admin_update_settings(p_daily_amount numeric,p_adm_default numeric)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$ select private.admin_update_settings(p_daily_amount,p_adm_default); $$;
revoke all on function public.admin_update_settings(numeric,numeric) from public, anon;
grant execute on function public.admin_update_settings(numeric,numeric) to authenticated;

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
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode='42501';
  end if;
  if p_report_date is null then raise exception 'Tanggal rekap tidak valid' using errcode='22023'; end if;
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

create or replace function public.admin_set_report_date(p_report_date date)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$ select private.admin_set_report_date(p_report_date); $$;
revoke all on function public.admin_set_report_date(date) from public, anon;
grant execute on function public.admin_set_report_date(date) to authenticated;

-- Ensure every approved payment catches up missing daily dues before wallet settlement.
create or replace function private.review_payment(
  p_submission_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin_id uuid := auth.uid();
  v_submission public.payment_submissions%rowtype;
  v_wallet public.member_wallets%rowtype;
  v_daily_amount numeric(12,2);
  v_arrears_paid numeric(12,2):=0;
  v_balance_credit numeric(12,2):=0;
  v_days_paid integer:=0;
  v_prepaid_days integer:=0;
  v_new_arrears numeric(12,2);
  v_report_date date;
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
    select daily_amount,report_date into v_daily_amount,v_report_date from public.dues_settings where id=1;
    perform private.process_daily_dues_internal(v_report_date-1);

    select * into v_wallet from public.member_wallets where member_id=v_submission.member_id for update;
    if not found then raise exception 'Dompet anggota tidak ditemukan' using errcode='P0002'; end if;

    if v_submission.payment_type='adm' then
      if v_submission.amount>v_wallet.adm_due then raise exception 'Nominal ADM melebihi sisa ADM' using errcode='22023'; end if;
      update public.member_wallets set adm_due=adm_due-v_submission.amount where member_id=v_submission.member_id;
      insert into public.wallet_transactions(member_id,transaction_type,amount,reference_id,description,created_by)
      values(v_submission.member_id,'adm_payment',v_submission.amount,v_submission.id,'Pelunasan ADM melalui pengajuan yang disetujui',v_admin_id);
    else
      if v_daily_amount<=0 then raise exception 'Tarif KAS harian belum valid' using errcode='22023'; end if;
      if mod(v_submission.amount,v_daily_amount)<>0 then raise exception 'Nominal KAS harus kelipatan tarif KAS harian' using errcode='22023'; end if;

      v_arrears_paid:=least(v_wallet.arrears,v_submission.amount);
      v_balance_credit:=v_submission.amount-v_arrears_paid;
      v_new_arrears:=v_wallet.arrears-v_arrears_paid;
      v_days_paid:=floor(v_arrears_paid/v_daily_amount)::integer;
      v_prepaid_days:=floor(v_balance_credit/v_daily_amount)::integer;

      update public.member_wallets
      set arrears=v_new_arrears,
          balance=balance+v_balance_credit,
          unpaid_from=case when v_new_arrears=0 then null
            when unpaid_from is not null and v_days_paid>0 then unpaid_from+v_days_paid else unpaid_from end,
          next_pay=case
            when v_arrears_paid>0 then coalesce(next_pay,unpaid_from,v_report_date)+v_days_paid+v_prepaid_days
            when v_new_arrears=0 then greatest(coalesce(next_pay,v_report_date),v_report_date)+v_prepaid_days
            else next_pay end
      where member_id=v_submission.member_id;

      insert into public.wallet_transactions(member_id,transaction_type,amount,reference_id,description,created_by)
      values(v_submission.member_id,'payment_credit',v_submission.amount,v_submission.id,
        'Pembayaran KAS disetujui; alokasi tunggakan '||v_arrears_paid::text||', saldo ke depan '||v_balance_credit::text,v_admin_id);
    end if;
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
      'arrears_paid',v_arrears_paid,'balance_credit',v_balance_credit,
      'arrears_days_settled',v_days_paid,'prepaid_days',v_prepaid_days));
  return jsonb_build_object('success',true,'submission_id',v_submission.id,'status',p_decision);
end;
$$;
revoke all on function private.review_payment(uuid,text,text) from public, anon;
grant execute on function private.review_payment(uuid,text,text) to authenticated;
