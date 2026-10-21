create or replace function public.admin_clear_chat_messages()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_admin_id uuid := auth.uid();
  v_deleted bigint;
begin
  if v_admin_id is null
     or not private.is_admin()
     or not exists (
       select 1
       from public.member_profiles
       where id = v_admin_id
         and role = 'admin'
         and status = 'active'
     ) then
    raise exception 'Hanya Super Admin aktif yang dapat mengosongkan riwayat chat'
      using errcode = '42501';
  end if;

  delete from public.chat_messages;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('success', true, 'deleted_count', v_deleted);
end;
$function$;
