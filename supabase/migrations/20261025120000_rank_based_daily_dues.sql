-- Effective-dated rank-based daily dues. Rank changes apply from the current report date forward.
-- Existing daily_dues_log rows are untouched; earlier unprocessed dates keep the base rate.
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

CREATE OR REPLACE FUNCTION private.process_daily_dues_internal(p_through_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
      -- The settings table permits a zero rate; treat it as a valid zero obligation.
      if v_rate is null or v_rate<0 then
        raise exception 'Tarif iuran harian tidak valid untuk tanggal %',v_due_date using errcode='22023';
      end if;

      -- Resolve rank as of the specific due date; rank changes never rewrite earlier obligations.
      select h.rank_code into v_rank_code
      from public.member_rank_rate_history h
      where h.member_id=v_profile.id and h.effective_from<=v_due_date
      order by h.effective_from desc limit 1;
      v_rank_code:=coalesce(v_rank_code,'P1');
      if v_rank_code in ('P5','P6','P7') then
        insert into public.daily_dues_log(member_id,due_date,daily_amount,balance_deducted,arrears_added,outcome)
        values(v_profile.id,v_due_date,v_rate,0,0,'exempt');
        v_processed:=v_processed+1;
        continue;
      end if;
      v_rank_multiplier:=case when v_rank_code='P3' then 0.80 when v_rank_code='P4' then 0.50 else 1.00 end;
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

CREATE OR REPLACE FUNCTION private.admin_set_member_rank(p_member_id uuid, p_rank_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_admin_id uuid := auth.uid();
  v_member public.member_profiles%rowtype;
  v_exempt boolean := false;
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode = '42501';
  end if;
  if p_rank_code is null or p_rank_code not in ('P1','P2','P3','P4','P5','P6','P7') then
    raise exception 'Pangkat harus P1 sampai P7' using errcode = '22023';
  end if;
  select * into v_member from public.member_profiles where id = p_member_id for update;
  if not found or v_member.role <> 'member' then
    raise exception 'Anggota tidak ditemukan' using errcode = 'P0002';
  end if;
  update public.member_profiles set rank_code = p_rank_code where id = p_member_id;
  insert into public.member_rank_rate_history(member_id,effective_from,rank_code)
  select p_member_id,report_date,p_rank_code from public.dues_settings where id=1
  on conflict(member_id,effective_from) do update set rank_code=excluded.rank_code;
  if p_rank_code in ('P5','P6','P7') then
    update public.member_wallets set exempt_kas = true, updated_at = now() where member_id = p_member_id;
    v_exempt := true;
  elsif p_rank_code in ('P1','P2','P3') then
    update public.member_wallets set exempt_kas = false, updated_at = now() where member_id = p_member_id;
    v_exempt := false;
  end if;
  insert into public.admin_audit_log(admin_id, action, target_type, target_id, details)
  values (v_admin_id, 'member_rank_changed', 'member_profile', p_member_id::text,
    jsonb_build_object('before',jsonb_build_object('rank_code',v_member.rank_code),
                       'after',jsonb_build_object('rank_code',p_rank_code,'exempt_kas_forced',v_exempt)));
  return jsonb_build_object('success',true,'member_id',p_member_id,'rank_code',p_rank_code,'exempt_kas',v_exempt);
end;
$function$;

revoke all on function private.process_daily_dues_internal(date) from public, anon, authenticated, service_role;
revoke all on function private.admin_set_member_rank(uuid,text) from public, anon;
grant execute on function private.admin_set_member_rank(uuid,text) to authenticated;
