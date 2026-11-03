-- Keep Vault History live updates enabled and limit direct table grants to signed-in users.
-- Existing RLS policies continue to decide which authenticated users may read or mutate rows.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vault_entries'
  ) then
    alter publication supabase_realtime add table public.vault_entries;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vault_settings'
  ) then
    alter publication supabase_realtime add table public.vault_settings;
  end if;
end
$$;

revoke all on table public.vault_entries, public.vault_settings from anon;
grant select, insert, update, delete on table public.vault_entries to authenticated;
grant select, insert, update on table public.vault_settings to authenticated;
