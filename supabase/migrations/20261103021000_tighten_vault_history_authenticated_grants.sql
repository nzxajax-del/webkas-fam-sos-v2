-- Keep only the table privileges the Vault History UI actually needs.
-- RLS policies remain the authorization boundary for row-level operations.
revoke all on table public.vault_entries, public.vault_settings from authenticated;
grant select, insert, update, delete on table public.vault_entries to authenticated;
grant select, insert, update on table public.vault_settings to authenticated;
