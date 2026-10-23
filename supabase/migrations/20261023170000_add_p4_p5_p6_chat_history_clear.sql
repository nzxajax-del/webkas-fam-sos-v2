create or replace function public.admin_clear_p4_p5_p6_chat_messages()
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
     or not exists (
       select 1
       from public.member_profiles
       where id = v_admin_id
         and role = 'admin'
         and status = 'active'
     ) then
    raise exception 'Hanya Super Admin aktif yang dapat mengosongkan riwayat Ruang Chat P4/P5/P6'
      using errcode = '42501';
  end if;

  delete from public.p4_p5_p6_chat_messages;
  get diagnostics v_deleted = row_count;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, details)
  values (
    v_admin_id,
    'clear_rank_chat_history',
    'p4_p5_p6_chat_messages',
    null,
    jsonb_build_object('deleted_count', v_deleted)
  );

  return jsonb_build_object('success', true, 'deleted_count', v_deleted);
end;
$function$;

revoke all on function public.admin_clear_p4_p5_p6_chat_messages() from public, anon;
grant execute on function public.admin_clear_p4_p5_p6_chat_messages() to authenticated;
