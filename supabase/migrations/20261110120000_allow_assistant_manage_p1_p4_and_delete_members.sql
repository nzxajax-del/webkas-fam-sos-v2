-- Grant active Admin Assistant narrowly scoped member management.
-- Preserve existing rank-rate history and wallet exemption side effects.
CREATE OR REPLACE FUNCTION private.admin_set_member_rank(p_member_id uuid, p_rank_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_admin_id uuid := auth.uid();
  v_admin_role text;
  v_member public.member_profiles%rowtype;
  v_exempt boolean := false;
BEGIN
  SELECT role INTO v_admin_role
  FROM public.member_profiles
  WHERE id = v_admin_id AND status = 'active';

  IF v_admin_id IS NULL OR v_admin_role NOT IN ('admin', 'admin_assistant') THEN
    RAISE EXCEPTION 'Akses admin diperlukan' USING errcode = '42501';
  END IF;

  IF p_rank_code IS NULL OR p_rank_code NOT IN ('P1','P2','P3','P4','P5','P6','P7') THEN
    RAISE EXCEPTION 'Pangkat tidak valid' USING errcode = '22023';
  END IF;

  SELECT * INTO v_member
  FROM public.member_profiles
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND OR v_member.role <> 'member' THEN
    RAISE EXCEPTION 'Anggota tidak ditemukan' USING errcode = 'P0002';
  END IF;

  -- Admin Assistant may manage P1-P4 only; P5/P6/VIP remain Developer-only.
  IF v_admin_role = 'admin_assistant'
     AND (
       v_member.rank_code IN ('P5','P6','P7')
       OR p_rank_code IN ('P5','P6','P7')
     ) THEN
    RAISE EXCEPTION 'Admin Assistant hanya dapat mengelola pangkat P1 sampai P4'
      USING errcode = '42501';
  END IF;

  UPDATE public.member_profiles SET rank_code = p_rank_code WHERE id = p_member_id;

  INSERT INTO public.member_rank_rate_history(member_id, effective_from, rank_code)
  SELECT p_member_id, report_date, p_rank_code
  FROM public.dues_settings WHERE id = 1
  ON CONFLICT (member_id, effective_from)
  DO UPDATE SET rank_code = excluded.rank_code;

  IF p_rank_code IN ('P5','P6','P7') THEN
    UPDATE public.member_wallets
    SET exempt_kas = true, updated_at = now()
    WHERE member_id = p_member_id;
    v_exempt := true;
  ELSIF p_rank_code IN ('P1','P2','P3') THEN
    UPDATE public.member_wallets
    SET exempt_kas = false, updated_at = now()
    WHERE member_id = p_member_id;
    v_exempt := false;
  END IF;

  INSERT INTO public.admin_audit_log(admin_id, action, target_type, target_id, details)
  VALUES (
    v_admin_id, 'member_rank_changed', 'member_profile', p_member_id::text,
    jsonb_build_object(
      'before', jsonb_build_object('rank_code', v_member.rank_code),
      'after', jsonb_build_object('rank_code', p_rank_code, 'exempt_kas_forced', v_exempt)
    )
  );

  RETURN jsonb_build_object(
    'success', true, 'member_id', p_member_id,
    'rank_code', p_rank_code, 'exempt_kas', v_exempt
  );
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
SET search_path = pg_catalog
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
    RAISE EXCEPTION 'Developer atau Admin Assistant aktif diperlukan' USING errcode = '42501';
  END IF;

  IF p_member_id IS NULL OR p_member_id = v_actor THEN
    RAISE EXCEPTION 'Tidak dapat menghapus akun sendiri';
  END IF;

  SELECT * INTO target FROM public.member_profiles WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND OR target.role <> 'member' THEN
    RAISE EXCEPTION 'Akun anggota tidak ditemukan' USING errcode = 'P0002';
  END IF;

  IF lower(btrim(coalesce(p_confirmation_username, ''))) <> lower(target.login_username) THEN
    RAISE EXCEPTION 'Konfirmasi username tidak cocok';
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
      'reason', 'Permanent deletion requested by authorized Developer/Admin Assistant; financial history archived before account removal',
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

REVOKE ALL ON FUNCTION public.admin_delete_member_without_financial_history(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_member_without_financial_history(uuid,text) TO authenticated;
