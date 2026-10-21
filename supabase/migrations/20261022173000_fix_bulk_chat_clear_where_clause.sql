-- Fix bulk chat clear to satisfy the database's explicit-WHERE safety guard.
-- Keep authorization restricted to active Super Admins.
CREATE OR REPLACE FUNCTION public.admin_clear_chat_messages()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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

  delete from public.chat_messages
  where id is not null;
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('success', true, 'deleted_count', v_deleted);
end;
$function$;
