-- Fix profile photo path validation: match the literal dot before the extension.
-- Keep the operation restricted to the authenticated user's own active profile.
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
