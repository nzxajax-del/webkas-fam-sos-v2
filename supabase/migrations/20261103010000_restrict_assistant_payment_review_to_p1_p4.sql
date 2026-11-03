create or replace function private.review_payment(p_submission_id uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_admin_role text;
  v_member_rank text;
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
  select role into v_admin_role from public.member_profiles
  where id = v_admin_id and status = 'active';
  if v_admin_role is null then
    raise exception 'Akun admin tidak aktif' using errcode='42501';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Keputusan tidak valid' using errcode='22023';
  end if;
  select * into v_submission from public.payment_submissions
  where id=p_submission_id for update;
  if not found then raise exception 'Pengajuan pembayaran tidak ditemukan' using errcode='P0002'; end if;
  if v_submission.status<>'pending' then raise exception 'Pengajuan ini sudah diproses' using errcode='55000'; end if;

  select rank_code into v_member_rank from public.member_profiles
  where id = v_submission.member_id and status = 'active';
  if v_admin_role = 'admin_assistant'
     and coalesce(v_member_rank, '') not in ('P1','P2','P3','P4') then
    raise exception 'Admin Asisten hanya dapat memproses pembayaran anggota P1 sampai P4' using errcode='42501';
  end if;

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
      'arrears_paid',v_arrears_paid,'balance_credit',v_balance_credit,
      'reviewer_role',v_admin_role,'member_rank',v_member_rank));
  return jsonb_build_object('success',true,'submission_id',v_submission.id,'status',p_decision,
    'arrears_paid',v_arrears_paid,'balance_credit',v_balance_credit);
end;
$function$;
