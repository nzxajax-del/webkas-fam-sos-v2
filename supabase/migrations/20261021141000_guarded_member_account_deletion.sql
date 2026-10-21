-- Permit permanent account deletion only when no financial history would be lost.
create or replace function public.admin_delete_member_without_financial_history(p_member_id uuid, p_confirmation_username text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  target public.member_profiles%rowtype;
begin
  if not (select private.is_admin()) then
    raise exception 'Admin access required';
  end if;
  if p_member_id is null or p_member_id = auth.uid() then
    raise exception 'Cannot delete the current account';
  end if;
  select * into target from public.member_profiles where id = p_member_id for update;
  if not found or target.role <> 'member' then
    raise exception 'Member account not found';
  end if;
  if lower(btrim(coalesce(p_confirmation_username,''))) <> lower(target.login_username) then
    raise exception 'Username confirmation does not match';
  end if;
  if exists (select 1 from public.wallet_transactions where member_id = p_member_id)
     or exists (select 1 from public.payment_submissions where member_id = p_member_id)
     or exists (select 1 from public.daily_dues_log where member_id = p_member_id) then
    raise exception 'Member has financial history; deactivate the account instead to preserve the ledger and audit history';
  end if;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, details)
  values (auth.uid(), 'member_permanently_deleted', 'member', p_member_id::text,
          jsonb_build_object('username', target.login_username, 'display_name', target.display_name, 'status', target.status, 'reason', 'No financial history'));
  delete from auth.users where id = p_member_id;
  if not found then raise exception 'Auth account could not be deleted'; end if;
  return jsonb_build_object('success', true, 'deleted_member_id', p_member_id);
end;
$$;
revoke all on function public.admin_delete_member_without_financial_history(uuid,text) from public, anon;
grant execute on function public.admin_delete_member_without_financial_history(uuid,text) to authenticated;