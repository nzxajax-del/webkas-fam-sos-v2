-- Member directory includes usernames and phone numbers. Limit it to administrative roles.
CREATE OR REPLACE FUNCTION private.get_public_member_directory()
RETURNS TABLE(
  id uuid,
  display_name text,
  login_username text,
  rank_code text,
  profile_photo_path text,
  phone_number text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_caller_status text;
  v_caller_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Login diperlukan' USING errcode = '42501';
  END IF;

  SELECT p.status, p.role
    INTO v_caller_status, v_caller_role
  FROM public.member_profiles p
  WHERE p.id = v_user_id;

  IF v_caller_status IS DISTINCT FROM 'active'
     OR v_caller_role NOT IN ('admin', 'admin_assistant') THEN
    RAISE EXCEPTION 'Daftar anggota hanya dapat diakses Developer atau Admin Assistant aktif'
      USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.login_username, p.rank_code, p.profile_photo_path, p.phone_number
  FROM public.member_profiles p
  WHERE p.status = 'active'
    AND p.role IN ('member', 'admin', 'admin_assistant')
  ORDER BY
    CASE p.rank_code
      WHEN 'P6' THEN 1
      WHEN 'P5' THEN 2
      WHEN 'P4' THEN 3
      WHEN 'P7' THEN 4
      WHEN 'P3' THEN 5
      WHEN 'P2' THEN 6
      WHEN 'P1' THEN 7
      ELSE 8
    END,
    lower(coalesce(p.display_name, ''));
END;
$function$;
