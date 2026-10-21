-- Atomic payment review: status, wallet, ledger, and audit log change in one transaction.
-- KAS payments settle arrears first, then credit prepaid balance. ADM payments only reduce ADM due.
alter table public.payment_submissions
  add column if not exists payment_type text not null default 'kas'
  check (payment_type in ('kas','adm'));

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
  v_arrears_paid numeric(12,2) := 0;
  v_balance_credit numeric(12,2) := 0;
  v_days_paid integer := 0;
  v_new_arrears numeric(12,2);
  v_report_date date;
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode = '42501';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Keputusan tidak valid' using errcode = '22023';
  end if;

  select * into v_submission
  from public.payment_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Pengajuan pembayaran tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_submission.status <> 'pending' then
    raise exception 'Pengajuan ini sudah diproses' using errcode = '55000';
  end if;

  if p_decision = 'approved' then
    select * into v_wallet
    from public.member_wallets
    where member_id = v_submission.member_id
    for update;

    if not found then
      raise exception 'Dompet anggota tidak ditemukan' using errcode = 'P0002';
    end if;

    select daily_amount, report_date into v_daily_amount, v_report_date
    from public.dues_settings where id = 1;

    if v_submission.payment_type = 'adm' then
      if v_submission.amount > v_wallet.adm_due then
        raise exception 'Nominal ADM melebihi sisa ADM' using errcode = '22023';
      end if;

      update public.member_wallets
      set adm_due = adm_due - v_submission.amount
      where member_id = v_submission.member_id;

      insert into public.wallet_transactions
        (member_id, transaction_type, amount, reference_id, description, created_by)
      values
        (v_submission.member_id, 'adm_payment', v_submission.amount, v_submission.id,
         'Pelunasan ADM melalui pengajuan yang disetujui', v_admin_id);
    else
      if v_daily_amount <= 0 then
        raise exception 'Tarif KAS harian belum valid' using errcode = '22023';
      end if;
      if mod(v_submission.amount, v_daily_amount) <> 0 then
        raise exception 'Nominal KAS harus kelipatan tarif KAS harian' using errcode = '22023';
      end if;

      v_arrears_paid := least(v_wallet.arrears, v_submission.amount);
      v_balance_credit := v_submission.amount - v_arrears_paid;
      v_new_arrears := v_wallet.arrears - v_arrears_paid;
      v_days_paid := floor(v_arrears_paid / v_daily_amount)::integer;

      update public.member_wallets
      set arrears = v_new_arrears,
          balance = balance + v_balance_credit,
          unpaid_from = case
            when v_new_arrears = 0 then null
            when unpaid_from is not null and v_days_paid > 0 then unpaid_from + v_days_paid
            else unpaid_from
          end,
          next_pay = case
            when v_new_arrears = 0 then greatest(coalesce(next_pay, v_report_date), v_report_date)
              + floor(v_balance_credit / v_daily_amount)::integer
            else next_pay
          end
      where member_id = v_submission.member_id;

      insert into public.wallet_transactions
        (member_id, transaction_type, amount, reference_id, description, created_by)
      values
        (v_submission.member_id, 'payment_credit', v_submission.amount, v_submission.id,
         'Pembayaran KAS disetujui; alokasi tunggakan ' || v_arrears_paid::text ||
         ', saldo ke depan ' || v_balance_credit::text, v_admin_id);
    end if;
  end if;

  update public.payment_submissions
  set status = p_decision,
      review_note = nullif(btrim(coalesce(p_note,'')), ''),
      reviewed_by = v_admin_id,
      reviewed_at = now()
  where id = v_submission.id;

  insert into public.admin_audit_log
    (admin_id, action, target_type, target_id, details)
  values
    (v_admin_id, case when p_decision = 'approved' then 'payment_approved' else 'payment_rejected' end,
     'payment_submission', v_submission.id::text,
     jsonb_build_object('member_id', v_submission.member_id, 'amount', v_submission.amount,
                        'payment_type', v_submission.payment_type, 'review_note', nullif(btrim(coalesce(p_note,'')), '')));

  return jsonb_build_object('success', true, 'submission_id', v_submission.id, 'status', p_decision);
end;
$$;

revoke all on function private.review_payment(uuid,text,text) from public, anon;
grant execute on function private.review_payment(uuid,text,text) to authenticated;

-- The UI must call the RPC, never update the payment row directly.
revoke update on table public.payment_submissions from authenticated;
drop policy if exists payment_submissions_admin_update on public.payment_submissions;
