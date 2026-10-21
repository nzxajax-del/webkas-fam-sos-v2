-- Allow a verified admin to clean up private registration proof files after guarded account deletion.
drop policy if exists registration_proofs_admin_delete on storage.objects;
create policy registration_proofs_admin_delete on storage.objects
for delete to authenticated
using (bucket_id = 'registration-proofs' and (select private.is_admin()));