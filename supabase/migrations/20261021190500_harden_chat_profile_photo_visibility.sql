-- Enforce photo-owner activity without opening member_profiles SELECT access through RLS.
create or replace function private.is_active_profile_photo_owner(p_owner_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.member_profiles p
    where p.id::text = p_owner_id
      and p.status = 'active'
      and p.role in ('member', 'admin')
  );
$function$;

revoke all on function private.is_active_profile_photo_owner(text) from public, anon;
grant execute on function private.is_active_profile_photo_owner(text) to authenticated;

drop policy if exists profile_photos_read_own_or_admin on storage.objects;
create policy profile_photos_read_own_or_admin on storage.objects
for select to authenticated using (
  bucket_id = 'profile-photos'
  and exists (
    select 1
    from public.member_profiles me
    where me.id = auth.uid()
      and me.status = 'active'
      and me.role in ('member', 'admin')
  )
  and private.is_active_profile_photo_owner((storage.foldername(name))[1])
);
