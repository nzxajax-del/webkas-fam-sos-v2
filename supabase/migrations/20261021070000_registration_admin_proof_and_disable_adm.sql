-- Registration administration is reviewed manually from a private screenshot, not charged automatically.
alter table public.member_profiles
  add column if not exists registration_proof_path text,
  add column if not exists registration_note text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('registration-proofs','registration-proofs',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false, file_size_limit=2097152, allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists registration_proofs_admin_read on storage.objects;
create policy registration_proofs_admin_read
on storage.objects for select to authenticated
using (bucket_id='registration-proofs' and (select private.is_admin()));

update public.dues_settings set adm_default=0 where id=1;
alter table public.member_wallets alter column adm_due set default 0;
update public.member_wallets set adm_due=0 where adm_due is not null and adm_due <> 0;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path='pg_catalog'
as $function$
declare
  requested_name text;
  requested_username text;
begin
  requested_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if requested_name is null then requested_name := 'member-' || left(new.id::text, 8); end if;
  requested_username := lower(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'login_username', '')), ''));
  if requested_username is null then requested_username := 'member-' || left(new.id::text, 8); end if;
  if requested_username !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'Username must be 3-30 lowercase letters, numbers, dots, underscores or hyphens';
  end if;
  insert into public.member_profiles (id, display_name, login_username, role, status)
  values (new.id, requested_name, requested_username, 'member', 'pending');
  -- No automatic ADM debt: the registration screenshot is reviewed manually.
  insert into public.member_wallets (member_id) values (new.id);
  return new;
end;
$function$;
