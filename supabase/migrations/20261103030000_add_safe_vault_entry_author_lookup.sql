-- Expose only the public author fields needed by Vault History chat messages.
-- The function returns only profiles that have authored a Vault entry.
create or replace function public.get_vault_entry_authors()
returns table (
  id uuid,
  display_name text,
  role text,
  rank_code text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct
    p.id,
    p.display_name,
    p.role,
    p.rank_code
  from public.member_profiles p
  inner join public.vault_entries v on v.created_by = p.id
  where auth.uid() is not null;
$$;

revoke all on function public.get_vault_entry_authors() from public;
revoke all on function public.get_vault_entry_authors() from anon;
grant execute on function public.get_vault_entry_authors() to authenticated;
