-- Profile photos: private storage, per-account ownership, and safe path updates.
alter table public.member_profiles add column if not exists profile_photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists profile_photos_upload_own_folder on storage.objects;
create policy profile_photos_upload_own_folder on storage.objects
for insert to authenticated with check (
 bucket_id = 'profile-photos'
 and (storage.foldername(name))[1] = auth.uid()::text
 and exists (select 1 from public.member_profiles p where p.id = auth.uid() and p.status = 'active')
);

drop policy if exists profile_photos_read_own_or_admin on storage.objects;
create policy profile_photos_read_own_or_admin on storage.objects
for select to authenticated using (
 bucket_id = 'profile-photos'
 and ((storage.foldername(name))[1] = auth.uid()::text or (select private.is_admin()))
);

drop policy if exists profile_photos_delete_own_or_admin on storage.objects;
create policy profile_photos_delete_own_or_admin on storage.objects
for delete to authenticated using (
 bucket_id = 'profile-photos'
 and ((storage.foldername(name))[1] = auth.uid()::text or (select private.is_admin()))
);

create or replace function public.set_my_profile_photo_path(p_path text)
returns void language plpgsql security definer set search_path = pg_catalog as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_path is not null and (
   length(p_path) > 300
   or p_path !~ ('^' || auth.uid()::text || '/[a-zA-Z0-9_-]+\.(jpg|png|webp)$')
 ) then raise exception 'Invalid profile photo path'; end if;
 update public.member_profiles set profile_photo_path = p_path
 where id = auth.uid() and status = 'active';
 if not found then raise exception 'Active member profile not found'; end if;
end;
$$;
revoke all on function public.set_my_profile_photo_path(text) from public, anon;
grant execute on function public.set_my_profile_photo_path(text) to authenticated;