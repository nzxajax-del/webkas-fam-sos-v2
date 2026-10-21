-- Harden the admin predicate by moving it out of the PostgREST-exposed public schema.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

drop policy if exists member_profiles_select_self_or_admin on public.member_profiles;
drop policy if exists member_profiles_admin_update on public.member_profiles;
drop policy if exists dues_settings_admin_update on public.dues_settings;
drop policy if exists member_wallets_select_self_or_admin on public.member_wallets;
drop policy if exists member_wallets_admin_all on public.member_wallets;
drop policy if exists wallet_transactions_select_self_or_admin on public.wallet_transactions;
drop policy if exists daily_dues_log_admin_select on public.daily_dues_log;
drop policy if exists payment_submissions_select_self_or_admin on public.payment_submissions;
drop policy if exists payment_submissions_admin_update on public.payment_submissions;
drop policy if exists admin_audit_log_admin_select on public.admin_audit_log;
drop policy if exists payment_proofs_read_own_or_admin on storage.objects;
drop policy if exists payment_proofs_delete_admin on storage.objects;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.member_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.status = 'active'
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;
drop function if exists public.is_admin();

create policy member_profiles_select_self_or_admin on public.member_profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy member_profiles_admin_update on public.member_profiles
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy dues_settings_admin_update on public.dues_settings
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy member_wallets_select_self_or_admin on public.member_wallets
  for select to authenticated
  using (member_id = (select auth.uid()) or (select private.is_admin()));
create policy member_wallets_admin_insert on public.member_wallets
  for insert to authenticated with check ((select private.is_admin()));
create policy member_wallets_admin_update on public.member_wallets
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy member_wallets_admin_delete on public.member_wallets
  for delete to authenticated using ((select private.is_admin()));

create policy wallet_transactions_select_self_or_admin on public.wallet_transactions
  for select to authenticated
  using (member_id = (select auth.uid()) or (select private.is_admin()));

create policy daily_dues_log_admin_select on public.daily_dues_log
  for select to authenticated using ((select private.is_admin()));

create policy payment_submissions_select_self_or_admin on public.payment_submissions
  for select to authenticated
  using (member_id = (select auth.uid()) or (select private.is_admin()));
create policy payment_submissions_admin_update on public.payment_submissions
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy admin_audit_log_admin_select on public.admin_audit_log
  for select to authenticated using ((select private.is_admin()));

create policy payment_proofs_read_own_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_admin())
    )
  );
create policy payment_proofs_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'payment-proofs' and (select private.is_admin()));

create index if not exists admin_audit_log_admin_id_idx on public.admin_audit_log (admin_id);
create index if not exists payment_submissions_member_id_idx on public.payment_submissions (member_id);
create index if not exists payment_submissions_reviewed_by_idx on public.payment_submissions (reviewed_by);
create index if not exists wallet_transactions_created_by_idx on public.wallet_transactions (created_by);
