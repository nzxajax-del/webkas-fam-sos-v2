-- Restore chat-only access to active members' display names, roles, ranks, and profile photos.
-- Do not grant broad SELECT access to member_profiles, which contains private fields.

create or replace function private.get_chat_sender_profiles(p_member_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid := auth.uid();
  v_caller_status text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Login diperlukan' using errcode = '42501';
  end if;

  select p.status into v_caller_status
  from public.member_profiles p
  where p.id = v_user_id;

  if v_caller_status is distinct from 'active' then
    raise exception 'Hanya anggota aktif yang dapat melihat identitas chat' using errcode = '42501';
  end if;

  if coalesce(cardinality(p_member_ids), 0) > 200 then
    raise exception 'Maksimal 200 profil chat per permintaan' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'role', p.role,
        'rank_code', p.rank_code,
        'profile_photo_path', p.profile_photo_path,
        'created_at', p.created_at
      )
    ),
    '[]'::jsonb
  )
  into v_result
  from public.member_profiles p
  where p.id = any(coalesce(p_member_ids, array[]::uuid[]))
    and p.status = 'active'
    and p.role in ('member', 'admin');

  return v_result;
end;
$function$;

revoke all on function private.get_chat_sender_profiles(uuid[]) from public, anon, authenticated;

create or replace function public.get_chat_sender_profiles(p_member_ids uuid[])
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $function$
  select private.get_chat_sender_profiles(p_member_ids);
$function$;

revoke all on function public.get_chat_sender_profiles(uuid[]) from public, anon;
grant execute on function public.get_chat_sender_profiles(uuid[]) to authenticated;

-- Profile images remain private: only signed-in, active members/admins can read them.
drop policy if exists profile_photos_read_own_or_admin on storage.objects;
create policy profile_photos_read_own_or_admin on storage.objects
for select to authenticated using (
  bucket_id = 'profile-photos'
  and exists (
    select 1
    from public.member_profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('member', 'admin')
  )
  and (storage.foldername(name))[1] in (
    select p.id::text
    from public.member_profiles p
    where p.status = 'active'
      and p.role in ('member', 'admin')
  )
);
