-- Allow active Admin Assistants to change only their own display name.
-- Preserve authentication, length validation, row lock, and self-only update.
create or replace function public.set_my_display_name(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_profile public.member_profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'Login diperlukan' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) < 1 or length(v_name) > 80 then
    raise exception 'Nama karakter harus 1–80 karakter' using errcode = '22023';
  end if;

  select * into v_profile
  from public.member_profiles
  where id = v_user_id
  for update;

  if not found or v_profile.status <> 'active'
     or v_profile.role not in ('member', 'admin', 'admin_assistant') then
    raise exception 'Akun aktif tidak ditemukan' using errcode = '42501';
  end if;

  update public.member_profiles
  set display_name = v_name
  where id = v_user_id;

  return jsonb_build_object('success', true, 'display_name', v_name);
end;
$function$;
