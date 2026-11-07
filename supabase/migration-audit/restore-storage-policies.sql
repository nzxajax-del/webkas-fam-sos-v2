-- WEBKAS Storage RLS policies captured from the source project.
-- Audit/restore aid only: do not execute until target public/private schema,
-- helper functions, buckets, and Auth data are restored and verified.
-- Source has 9 policies on storage.objects; target currently has 0.

CREATE POLICY payment_proofs_assistant_read_p1_p4
ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
USING (
  (bucket_id = 'payment-proofs'::text)
  AND (SELECT private.is_admin_assistant() AS is_admin_assistant)
  AND EXISTS (
    SELECT 1
    FROM public.member_profiles m
    WHERE m.id::text = (storage.foldername(objects.name))[1]
      AND m.role = 'member'
      AND m.status = 'active'
      AND m.rank_code = ANY (ARRAY['P1'::text, 'P2'::text, 'P3'::text, 'P4'::text])
  )
);

CREATE POLICY payment_proofs_delete_developer
ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
USING (
  bucket_id = 'payment-proofs'::text
  AND (SELECT private.is_developer() AS is_developer)
);

CREATE POLICY payment_proofs_read_own_or_developer
ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'::text
  AND (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR (SELECT private.is_developer() AS is_developer)
  )
);

CREATE POLICY payment_proofs_upload_own_folder
ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'::text
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.member_profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role = 'member'
  )
);

CREATE POLICY profile_photos_delete_own_or_admin
ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
USING (
  bucket_id = 'profile-photos'::text
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (SELECT private.is_admin() AS is_admin)
  )
);

CREATE POLICY profile_photos_read_own_or_admin
ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
USING (
  bucket_id = 'profile-photos'::text
  AND EXISTS (
    SELECT 1
    FROM public.member_profiles me
    WHERE me.id = auth.uid()
      AND me.status = 'active'
      AND me.role = ANY (ARRAY['member'::text, 'admin'::text, 'admin_assistant'::text])
  )
  AND private.is_active_profile_photo_owner((storage.foldername(name))[1])
);

CREATE POLICY profile_photos_upload_own_folder
ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos'::text
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM public.member_profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
  )
);

CREATE POLICY registration_proofs_admin_delete
ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated
USING (
  bucket_id = 'registration-proofs'::text
  AND (SELECT private.is_admin() AS is_admin)
);

CREATE POLICY registration_proofs_admin_read
ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
USING (
  bucket_id = 'registration-proofs'::text
  AND (SELECT private.is_admin() AS is_admin)
);
