-- Keep historical profile-photo objects intact, but stop new profile-photo uploads.
-- The current UI displays rank emblems and does not provide photo upload controls.
DROP POLICY IF EXISTS profile_photos_upload_own_folder ON storage.objects;
