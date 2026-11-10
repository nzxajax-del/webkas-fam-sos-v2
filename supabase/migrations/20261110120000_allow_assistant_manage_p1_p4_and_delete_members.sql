-- Expand only the two requested member-management capabilities for active Admin Assistant accounts.
-- Developer retains existing full access. Assistants may assign P1-P4 only and may delete member-role accounts.
CREATE OR REPLACE FUNCTION private.admin_set_member_rank(p_member_id uuid, p_rank_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_developer boolean := private.is_admin();
  v_is_assistant boolean := false;
  v_member public.member_profiles%rowtype;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING errcode = '42501';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.member_profiles
    WHERE id = v_actor AND role = 'admin_assistant' AND status = 'active'
  ) INTO v_is_assistant;
  IF NOT v_is_developer AND NOT v_is_assistant THEN
    RAISE EXCEPTION 'Active Developer or Admin Assistant access required' USING errcode = '42501';
  END IF;
  IF p_rank_code IS NULL OR p_rank_code NOT IN ('P1','P2','P3','P4','P5','P6') THEN
    RAISE EXCEPTION 'Rank must be P1 through P6' USING errcode = '22023';
  END IF;
  SELECT * INTO v_member FROM public.member_profiles WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND OR v_member.role <> 'member' THEN
    RAISE EXCEPTION 'Member account not found' USING errcode = 'P0002';
  END IF;
  IF v_is_assistant AND (p_rank_code NOT IN ('P1','P2','P3','P4') OR v_member.rank_code NOT IN ('P1','P2','P3','P4')) THEN
    RAISE EXCEPTION 'Admin Assistant may only manage ranks P1 through P4' USING errcode = '42501';
  END IF;
  UPDATE public.member_profiles SET rank_code = p_rank_code WHERE id = p_member_id;
  INSERT INTO public.admin_audit_log(admin_id, action, target_type, target_id, details)
  VALUES (v_actor, 'member_rank_changed', 'member_profile', p_member_id::text,
    jsonb_build_object('before',jsonb_build_object('rank_code',v_member.rank_code),
                       'after',jsonb_build_object('rank_code',p_rank_code)));
  RETURN jsonb_build_object('success',true,'member_id',p_member_id,'rank_code',p_rank_code);
END;
$function$;

REVOKE ALL ON FUNCTION private.admin_set_member_rank(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_set_member_rank(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_member_rank(p_member_id uuid, p_rank_code text)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
  SELECT private.admin_set_member_rank(p_member_id,p_rank_code);
$function$;
REVOKE ALL ON FUNCTION public.admin_set_member_rank(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_member_rank(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_member_without_financial_history(
  p_member_id uuid,
  p_confirmation_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  target public.member_profiles%rowtype;
  wallet_snapshot jsonb;
  transactions_snapshot jsonb;
  payments_snapshot jsonb;
  dues_snapshot jsonb;
  payment_proof_paths text[];
  financial_snapshot jsonb;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR (
    NOT private.is_admin() AND NOT EXISTS (
      SELECT 1 FROM public.member_profiles
      WHERE id = v_actor AND role = 'admin_assistant' AND status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'Active Developer or Admin Assistant access required' USING errcode = '42501';
  END IF;
  IF p_member_id IS NULL OR p_member_id = v_actor THEN
    RAISE EXCEPTION 'Cannot delete the current account';
  END IF;
  SELECT * INTO target FROM public.member_profiles WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND OR target.role <> 'member' THEN
    RAISE EXCEPTION 'Member account not found';
  END IF;
  IF lower(btrim(coalesce(p_confirmation_username, ''))) <> lower(target.login_username) THEN
    RAISE EXCEPTION 'Username confirmation does not match';
  END IF;
  SELECT to_jsonb(w) INTO wallet_snapshot FROM public.member_wallets w WHERE w.member_id = p_member_id;
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb)
    INTO transactions_snapshot FROM public.wallet_transactions t WHERE t.member_id = p_member_id;
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.created_at), '[]'::jsonb),
         coalesce(array_agg(p.proof_path) FILTER (
           WHERE p.proof_path IS NOT NULL AND btrim(p.proof_path) <> '' AND p.proof_storage_source = 'current'
         ), array[]::text[])
    INTO payments_snapshot, payment_proof_paths
  FROM public.payment_submissions p WHERE p.member_id = p_member_id;
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.due_date), '[]'::jsonb)
    INTO dues_snapshot FROM public.daily_dues_log d WHERE d.member_id = p_member_id;
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
  INSERT INTO public.admin_audit_log (admin_id, action, target_type, target_id, details)
  VALUES (
    v_actor, 'member_permanently_deleted', 'member', p_member_id::text,
    jsonb_build_object(
      'username', target.login_username, 'display_name', target.display_name, 'status', target.status,
      'reason', 'Permanent deletion requested by authorized admin; financial history archived before account removal',
      'financial_history_archived', true, 'financial_snapshot', financial_snapshot
    )
  );
  DELETE FROM public.daily_dues_log WHERE member_id = p_member_id;
  DELETE FROM public.payment_submissions WHERE member_id = p_member_id;
  DELETE FROM public.wallet_transactions WHERE member_id = p_member_id;
  DELETE FROM auth.users WHERE id = p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Auth account could not be deleted'; END IF;
  RETURN jsonb_build_object(
    'success', true, 'deleted_member_id', p_member_id, 'financial_history_archived', true,
    'payment_proof_paths', to_jsonb(coalesce(payment_proof_paths, array[]::text[])),
    'profile_photo_path', target.profile_photo_path,
    'registration_proof_path', target.registration_proof_path,
    'registration_proof_source', target.registration_proof_source
  );
END;
$function$;
