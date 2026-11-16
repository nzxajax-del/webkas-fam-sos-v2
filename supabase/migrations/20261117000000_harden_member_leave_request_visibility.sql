-- Restrict leave-request visibility to the owner and active Developer/Admin Assistant.
-- The previous policy exposed every active member's leave reason and status to all members.
DROP POLICY IF EXISTS member_leave_requests_select_all_active_members
  ON public.member_leave_requests;

CREATE POLICY member_leave_requests_select_own_or_admin
  ON public.member_leave_requests
  FOR SELECT
  TO authenticated
  USING (
    member_id = (SELECT auth.uid())
    OR (SELECT private.is_admin())
  );

CREATE OR REPLACE FUNCTION public.get_member_leave_requests()
RETURNS TABLE(
  id uuid,
  member_id uuid,
  display_name text,
  rank_code text,
  role text,
  leave_type text,
  offline_days integer,
  reason text,
  created_at timestamptz,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.member_profiles viewer
    WHERE viewer.id = auth.uid()
      AND viewer.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Akun aktif diperlukan untuk melihat ruang perizinan.'
      USING errcode = '42501';
  END IF;

  RETURN QUERY
  SELECT r.id, r.member_id, p.display_name, p.rank_code, p.role,
         r.leave_type, r.offline_days, r.reason, r.created_at, r.status
  FROM public.member_leave_requests r
  JOIN public.member_profiles p ON p.id = r.member_id
  WHERE p.status = 'active'
    AND (
      r.member_id = auth.uid()
      OR private.is_admin()
    )
  ORDER BY r.created_at DESC
  LIMIT 200;
END;
$function$;
