-- Allow active Admin Assistants to view profile photos while preserving per-account upload ownership.
-- Also fix the escaped extension dot in the self-service photo path validator.
create or replace function private.is_active_profile_photo_owner(p_owner_id text)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog'
as $function$
  select exists (
    select 1
    from public.member_profiles p
    where p.id::text = p_owner_id
      and p.status = 'active'
      and p.role in ('member', 'admin', 'admin_assistant')
  );
$function$;

drop policy if exists profile_photos_read_own_or_admin on storage.objects;
create policy profile_photos_read_own_or_admin
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-photos'
  and exists (
    select 1
    from public.member_profiles me
    where me.id = auth.uid()
      and me.status = 'active'
      and me.role = any (array['member', 'admin', 'admin_assistant'])
  )
  and private.is_active_profile_photo_owner((storage.foldername(name))[1])
);

create or replace function public.set_my_profile_photo_path(p_path text)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_path is not null and (
    length(p_path) > 300
    or p_path !~ ('^' || auth.uid()::text || '/[a-zA-Z0-9_-]+\.(jpg|png|webp)$')
  ) then
    raise exception 'Invalid profile photo path';
  end if;

  update public.member_profiles
  set profile_photo_path = p_path
  where id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'Active member profile not found';
  end if;
end;
$function$;
