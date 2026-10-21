-- Prevent direct status edits from bypassing ledger settlement.
-- A dedicated atomic review RPC will be added only after settlement rules are regression-tested.
drop policy if exists payment_submissions_admin_update on public.payment_submissions;
revoke update on table public.payment_submissions from authenticated;

-- Member profiles and wallet adjustments remain admin-only through RLS.
-- No client role can directly insert or mutate wallet_transactions/daily_dues_log.
