-- Least-privilege grants. RLS remains the row-level enforcement layer.
revoke all on table public.member_profiles from anon, authenticated;
revoke all on table public.dues_settings from anon, authenticated;
revoke all on table public.member_wallets from anon, authenticated;
revoke all on table public.wallet_transactions from anon, authenticated;
revoke all on table public.daily_dues_log from anon, authenticated;
revoke all on table public.payment_submissions from anon, authenticated;
revoke all on table public.admin_audit_log from anon, authenticated;

grant select, update on table public.member_profiles to authenticated;
grant select, update on table public.dues_settings to authenticated;
grant select, insert, update, delete on table public.member_wallets to authenticated;
grant select on table public.wallet_transactions to authenticated;
grant select on table public.daily_dues_log to authenticated;
grant select, insert, update on table public.payment_submissions to authenticated;
grant select on table public.admin_audit_log to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
