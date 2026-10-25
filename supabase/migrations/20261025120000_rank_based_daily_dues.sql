-- Effective-dated rank-based daily dues. New rates apply from the current report date forward;
-- already logged dues are never rewritten and earlier unprocessed dates retain the base rate.
create table if not exists public.member_rank_rate_history (
  member_id uuid not null references public.member_profiles(id) on delete cascade,
  effective_from date not null,
  rank_code text not null check (rank_code in ('P1','P2','P3','P4','P5','P6','P7')),
  created_at timestamptz not null default now(),
  primary key(member_id,effective_from)
);
alter table public.member_rank_rate_history enable row level security;
revoke all on table public.member_rank_rate_history from public, anon, authenticated, service_role;

insert into public.member_rank_rate_history(member_id,effective_from,rank_code)
select p.id,s.report_date,case when p.rank_code in ('P1','P2','P3','P4','P5','P6','P7') then p.rank_code else 'P1' end
from public.member_profiles p cross join public.dues_settings s
where s.id=1 and p.status='active'
on conflict(member_id,effective_from) do nothing;

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
  v_rank_code text;
  v_rank_multiplier numeric(4,2);
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

      -- Rank rates are effective-dated; existing/unprocessed historical dates keep the base rate.
      select h.rank_code into v_rank_code
      from public.member_rank_rate_history h
      where h.member_id=v_profile.id and h.effective_from<=v_due_date
      order by h.effective_from desc limit 1;
      v_rank_code:=coalesce(v_rank_code,'P1');
      v_rank_multiplier:=case
        when v_rank_code='P3' then 0.80
        when v_rank_code='P4' then 0.50
        else 1.00
      end;
      if v_rank_code in ('P5','P6','P7') then
        insert into public.daily_dues_log(member_id,due_date,daily_amount,balance_deducted,arrears_added,outcome)
        values(v_profile.id,v_due_date,v_rate,0,0,'exempt');
        v_processed:=v_processed+1;
        continue;
      end if;
      v_rate:=round(v_rate*v_rank_multiplier,2);

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

create or replace function private.admin_set_member_rank(p_member_id uuid, p_rank_code text)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog'
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_member public.member_profiles%rowtype;
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode = '42501';
  end if;
  if p_rank_code is null or p_rank_code not in ('P1','P2','P3','P4','P5','P6') then
    raise exception 'Pangkat harus P1 sampai P6' using errcode = '22023';
  end if;
  select * into v_member from public.member_profiles where id = p_member_id for update;
  if not found or v_member.role <> 'member' then
    raise exception 'Anggota tidak ditemukan' using errcode = 'P0002';
  end if;
  update public.member_profiles set rank_code = p_rank_code where id = p_member_id;
  insert into public.member_rank_rate_history(member_id,effective_from,rank_code)
  select p_member_id,report_date,p_rank_code from public.dues_settings where id=1
  on conflict(member_id,effective_from) do update set rank_code=excluded.rank_code;
  insert into public.admin_audit_log(admin_id, action, target_type, target_id, details)
  values (v_admin_id, 'member_rank_changed', 'member_profile', p_member_id::text,
    jsonb_build_object('before',jsonb_build_object('rank_code',v_member.rank_code),
                       'after',jsonb_build_object('rank_code',p_rank_code)));
  return jsonb_build_object('success',true,'member_id',p_member_id,'rank_code',p_rank_code);
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
  v_payment_days integer:=0;
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

      v_arrears_paid:=least(v_wallet.arrears,v_submission.amount);
      v_balance_credit:=v_submission.amount-v_arrears_paid;
      v_new_arrears:=v_wallet.arrears-v_arrears_paid;
      v_days_paid:=floor(v_arrears_paid/v_daily_amount)::integer;
      v_prepaid_days:=floor(v_balance_credit/v_daily_amount)::integer;
      v_payment_days:=floor(v_submission.amount/v_daily_amount)::integer;

      update public.member_wallets
      set arrears=v_new_arrears,
          balance=balance+v_balance_credit,
          unpaid_from=case when v_new_arrears=0 then null
            when unpaid_from is not null and v_days_paid>0 then unpaid_from+v_days_paid else unpaid_from end,
          next_pay=case
            when v_arrears_paid>0 then coalesce(next_pay,unpaid_from,v_report_date)+v_payment_days
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
      'arrears_days_settled',v_days_paid,'prepaid_days',v_prepaid_days,'payment_days',v_payment_days));
  return jsonb_build_object('success',true,'submission_id',v_submission.id,'status',p_decision);
end;
$$;

revoke all on function private.process_daily_dues_internal(date) from public, anon, authenticated, service_role;
revoke all on function private.admin_set_member_rank(uuid,text) from public, anon;
grant execute on function private.admin_set_member_rank(uuid,text) to authenticated;
revoke all on function private.review_payment(uuid,text,text) from public, anon;
grant execute on function private.review_payment(uuid,text,text) to authenticated;
