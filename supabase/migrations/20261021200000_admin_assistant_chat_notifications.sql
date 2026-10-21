-- Grant Admin Assistant the chat and notification visibility it needs without
-- changing the master-only guard used by sensitive settings/rank operations.
create or replace function private.is_admin_assistant()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1 from public.member_profiles p
    where p.id = auth.uid()
      and p.role = 'admin_assistant'
      and p.status = 'active'
  );
$function$;
revoke all on function private.is_admin_assistant() from public, anon, authenticated;
grant execute on function private.is_admin_assistant() to authenticated;

-- Active assistants can read member records for their assigned administration
-- duties; master-only writes remain governed by existing RPC checks.
drop policy if exists member_profiles_select_admin_assistant on public.member_profiles;
create policy member_profiles_select_admin_assistant
on public.member_profiles for select to authenticated
using (private.is_admin_assistant());

-- Assistants need to see pending payment submissions and their counts.
drop policy if exists payment_submissions_select_admin_assistant on public.payment_submissions;
create policy payment_submissions_select_admin_assistant
on public.payment_submissions for select to authenticated
using (private.is_admin_assistant());

-- Shared chat: active assistants may read messages and send their own messages.
drop policy if exists chat_messages_select_admin_assistant on public.chat_messages;
create policy chat_messages_select_admin_assistant
on public.chat_messages for select to authenticated
using (private.is_admin_assistant());

drop policy if exists chat_messages_insert_admin_assistant on public.chat_messages;
create policy chat_messages_insert_admin_assistant
on public.chat_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and private.is_admin_assistant()
);

grant select, insert on public.chat_messages to authenticated;

-- The chat identity RPC must include active Admin Assistant profiles so their
-- role emblem and profile image can be resolved for other chat participants.
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
    jsonb_agg(jsonb_build_object(
      'id', p.id,
      'display_name', p.display_name,
      'role', p.role,
      'rank_code', p.rank_code,
      'profile_photo_path', p.profile_photo_path,
      'created_at', p.created_at
    )),
    '[]'::jsonb
  )
  into v_result
  from public.member_profiles p
  where p.id = any(coalesce(p_member_ids, array[]::uuid[]))
    and p.status = 'active'
    and p.role in ('member', 'admin', 'admin_assistant');

  return v_result;
end;
$function$;

revoke all on function private.get_chat_sender_profiles(uuid[]) from public, anon;
grant execute on function private.get_chat_sender_profiles(uuid[]) to authenticated;
