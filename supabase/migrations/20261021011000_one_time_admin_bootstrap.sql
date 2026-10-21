-- One-time first-admin bootstrap. Only the owner-held token hash is stored in the database.
create table if not exists private.admin_bootstrap_tokens (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null
);
revoke all on table private.admin_bootstrap_tokens from public, anon, authenticated, service_role;

insert into private.admin_bootstrap_tokens(token_hash)
values ('b3661358a5c937cfec4e9f1379505e2e620ba11f8192d32e8d2d28c2b6c104f6')
on conflict (token_hash) do nothing;

create or replace function private.bootstrap_first_admin(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.member_profiles%rowtype;
  v_token_hash text;
begin
  if v_user_id is null then
    raise exception 'Login diperlukan' using errcode = '42501';
  end if;

  if exists (select 1 from public.member_profiles where role = 'admin') then
    raise exception 'Admin pertama sudah ditetapkan' using errcode = '55000';
  end if;

  select token_hash into v_token_hash
  from private.admin_bootstrap_tokens
  where used_at is null
  order by created_at
  limit 1
  for update;

  if not found or p_token is null or length(p_token) < 20
     or encode(extensions.digest(p_token, 'sha256'), 'hex') <> v_token_hash then
    raise exception 'Kode bootstrap tidak valid atau sudah digunakan' using errcode = '42501';
  end if;

  select * into v_profile from public.member_profiles where id = v_user_id for update;
  if not found or v_profile.role <> 'member' or v_profile.status <> 'pending' then
    raise exception 'Gunakan akun anggota yang masih menunggu persetujuan' using errcode = '55000';
  end if;

  update public.member_profiles set role = 'admin', status = 'active' where id = v_user_id;
  update public.member_wallets set exempt_kas = true, adm_due = 0 where member_id = v_user_id;
  update private.admin_bootstrap_tokens set used_at = now(), used_by = v_user_id where token_hash = v_token_hash;

  insert into public.admin_audit_log(admin_id,action,target_type,target_id,details)
  values(v_user_id,'first_admin_bootstrapped','member_profile',v_user_id::text,
         jsonb_build_object('login_username',v_profile.login_username));

  return jsonb_build_object('success',true,'message','Admin utama berhasil diaktifkan.');
end;
$$;
revoke all on function private.bootstrap_first_admin(text) from public, anon;
grant execute on function private.bootstrap_first_admin(text) to authenticated;

create or replace function public.bootstrap_first_admin(p_token text)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$
  select private.bootstrap_first_admin(p_token);
$$;
revoke all on function public.bootstrap_first_admin(text) from public, anon;
grant execute on function public.bootstrap_first_admin(text) to authenticated;
