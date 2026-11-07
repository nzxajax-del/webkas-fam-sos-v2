CREATE OR REPLACE FUNCTION public.admin_delete_member_without_financial_history(
  p_member_id uuid,
  p_confirmation_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
declare
  target public.member_profiles%rowtype;
  wallet_snapshot jsonb;
  transactions_snapshot jsonb;
  payments_snapshot jsonb;
  dues_snapshot jsonb;
  payment_proof_paths text[];
  financial_snapshot jsonb;
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
  if lower(btrim(coalesce(p_confirmation_username, ''))) <> lower(target.login_username) then
    raise exception 'Username confirmation does not match';
  end if;
  select to_jsonb(w) into wallet_snapshot from public.member_wallets w where w.member_id = p_member_id;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
    into transactions_snapshot from public.wallet_transactions t where t.member_id = p_member_id;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]'::jsonb),
         coalesce(array_agg(p.proof_path) filter (
           where p.proof_path is not null and btrim(p.proof_path) <> '' and p.proof_storage_source = 'current'
         ), array[]::text[])
    into payments_snapshot, payment_proof_paths
  from public.payment_submissions p where p.member_id = p_member_id;
  select coalesce(jsonb_agg(to_jsonb(d) order by d.due_date), '[]'::jsonb)
    into dues_snapshot from public.daily_dues_log d where d.member_id = p_member_id;
  financial_snapshot := jsonb_build_object(
    'archive_version', 1, 'archived_at', now(),
    'member', jsonb_build_object(
      'id', target.id, 'username', target.login_username, 'display_name', target.display_name,
      'status', target.status, 'role', target.role, 'rank_code', target.rank_code,
      'created_at', target.created_at, 'profile_photo_path', target.profile_photo_path,
      'registration_proof_path', target.registration_proof_path,
      'registration_proof_source', target.registration_proof_source
    ),
    'wallet', coalesce(wallet_snapshot, '{}'::jsonb),
    'wallet_transactions', transactions_snapshot,
    'payment_submissions', payments_snapshot,
    'daily_dues_log', dues_snapshot
  );
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, details)
  values (
    auth.uid(), 'member_permanently_deleted', 'member', p_member_id::text,
    jsonb_build_object(
      'username', target.login_username, 'display_name', target.display_name, 'status', target.status,
      'reason', 'Permanent deletion requested by admin; financial history archived before account removal',
      'financial_history_archived', true, 'financial_snapshot', financial_snapshot
    )
  );
  delete from public.daily_dues_log where member_id = p_member_id;
  delete from public.payment_submissions where member_id = p_member_id;
  delete from public.wallet_transactions where member_id = p_member_id;
  delete from auth.users where id = p_member_id;
  if not found then raise exception 'Auth account could not be deleted'; end if;
  return jsonb_build_object(
    'success', true, 'deleted_member_id', p_member_id, 'financial_history_archived', true,
    'payment_proof_paths', to_jsonb(coalesce(payment_proof_paths, array[]::text[])),
    'profile_photo_path', target.profile_photo_path,
    'registration_proof_path', target.registration_proof_path,
    'registration_proof_source', target.registration_proof_source
  );
end;
$function$;
