-- Keep the public RPC as SECURITY INVOKER; the private implementation performs the active-member guard.
grant execute on function private.get_chat_sender_profiles(uuid[]) to authenticated;

create or replace function public.get_chat_sender_profiles(p_member_ids uuid[])
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $function$
  select private.get_chat_sender_profiles(p_member_ids);
$function$;

revoke all on function public.get_chat_sender_profiles(uuid[]) from public, anon;
grant execute on function public.get_chat_sender_profiles(uuid[]) to authenticated;
