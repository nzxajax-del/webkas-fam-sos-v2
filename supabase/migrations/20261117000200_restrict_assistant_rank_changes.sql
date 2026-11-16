-- Enforce the requested Admin Assistant rank boundary in the database.
-- Assistants may manage P1-P3 only; P4/P5/P6/VIP remain Developer-only.
-- Assigning P4 must also clear the rank-based KAS exemption.
CREATE OR REPLACE FUNCTION private.admin_set_member_rank(p_member_id uuid, p_rank_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
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

  IF v_admin_id IS NULL OR coalesce(v_admin_role, '') NOT IN ('admin', 'admin_assistant') THEN
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

  IF v_admin_role = 'admin_assistant'
     AND (
       v_member.rank_code NOT IN ('P1','P2','P3')
       OR p_rank_code NOT IN ('P1','P2','P3')
     ) THEN
    RAISE EXCEPTION 'Admin Assistant hanya dapat mengelola pangkat P1 sampai P3'
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
  ELSE
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
