-- Positive admin balance corrections settle arrears before crediting prepaid balance.
-- Negative corrections reduce prepaid balance only and never create arrears.
create or replace function private.admin_adjust_member_balance(p_member_id uuid, p_delta numeric, p_reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_admin_id uuid := auth.uid();
  v_member public.member_profiles%rowtype;
  v_wallet public.member_wallets%rowtype;
  v_arrears_paid numeric(12,2) := 0;
  v_balance_credit numeric(12,2) := 0;
  v_new_arrears numeric(12,2);
  v_new_balance numeric(12,2);
begin
  if v_admin_id is null or not private.is_admin() then
    raise exception 'Akses admin diperlukan' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 1000000000 or p_delta <> trunc(p_delta,2)
     or length(btrim(coalesce(p_reason,''))) < 5 or length(btrim(p_reason)) > 500 then
    raise exception 'Nominal koreksi atau alasan tidak valid' using errcode = '22023';
  end if;

  select * into v_member from public.member_profiles where id=p_member_id for update;
  if not found or v_member.role <> 'member' then
    raise exception 'Anggota tidak ditemukan' using errcode = 'P0002';
  end if;
  select * into v_wallet from public.member_wallets where member_id=p_member_id for update;
  if not found then
    raise exception 'Dompet anggota tidak ditemukan' using errcode = 'P0002';
  end if;

  v_new_arrears := v_wallet.arrears;
  v_new_balance := v_wallet.balance;

  if p_delta > 0 then
    v_arrears_paid := least(v_wallet.arrears, p_delta);
    v_balance_credit := p_delta - v_arrears_paid;
    v_new_arrears := v_wallet.arrears - v_arrears_paid;
    v_new_balance := v_wallet.balance + v_balance_credit;
  else
    if v_wallet.balance + p_delta < 0 then
      raise exception 'Saldo tersedia tidak cukup untuk pengurangan ini' using errcode = '22023';
    end if;
    v_new_balance := v_wallet.balance + p_delta;
  end if;

  update public.member_wallets
  set balance=v_new_balance,
      arrears=v_new_arrears,
      unpaid_from=case when v_new_arrears=0 then null else unpaid_from end,
      updated_at=now()
  where member_id=p_member_id;

  insert into public.wallet_transactions(member_id,transaction_type,amount,description,created_by)
  values (
    p_member_id,'admin_adjustment',abs(p_delta),
    'Koreksi saldo oleh admin (' || case when p_delta > 0 then '+' else '' end || p_delta::text ||
    '): ' || btrim(p_reason) ||
    case when p_delta > 0 then
      ' | tunggakan dilunasi ' || v_arrears_paid::text || ' UIC; masuk saldo ' || v_balance_credit::text || ' UIC'
    else
      ' | pengurangan dari saldo tersedia; tunggakan tidak diubah'
    end,
    v_admin_id
  );

  insert into public.admin_audit_log(admin_id,action,target_type,target_id,details)
  values (
    v_admin_id,'member_balance_adjusted','member_wallet',p_member_id::text,
    jsonb_build_object(
      'username',v_member.login_username,'delta',p_delta,
      'before_balance',v_wallet.balance,'after_balance',v_new_balance,
      'before_arrears',v_wallet.arrears,'after_arrears',v_new_arrears,
      'arrears_paid',v_arrears_paid,'balance_credit',v_balance_credit,
      'reason',btrim(p_reason)
    )
  );

  return jsonb_build_object(
    'success',true,'member_id',p_member_id,'balance',v_new_balance,
    'arrears',v_new_arrears,'arrears_paid',v_arrears_paid,
    'balance_credit',v_balance_credit,'delta',p_delta
  );
end;
$$;

revoke all on function private.admin_adjust_member_balance(uuid,numeric,text) from public, anon;
grant execute on function private.admin_adjust_member_balance(uuid,numeric,text) to authenticated;

create or replace function public.admin_adjust_member_balance(p_member_id uuid,p_delta numeric,p_reason text)
returns jsonb language sql security invoker set search_path = pg_catalog as $$
  select private.admin_adjust_member_balance(p_member_id,p_delta,p_reason);
$$;

revoke all on function public.admin_adjust_member_balance(uuid,numeric,text) from public, anon;
grant execute on function public.admin_adjust_member_balance(uuid,numeric,text) to authenticated;
