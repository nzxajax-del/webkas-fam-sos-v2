# WEBKAS source restore-scope inventory — 2026-11-07

This is a metadata-only, read-only inventory. No application rows, credentials, tokens, secret values, or storage file contents were exported or changed.

## Database namespaces
Application-relevant schemas observed:
- `public`
- `private`
- `auth`
- `storage`
- `cron`
- `realtime`
- `vault`
- `extensions`
- Supabase-managed GraphQL and migration schemas

## Private application tables
- `private.admin_bootstrap_tokens` — metadata only; contents deliberately not inspected.
- `private.admin_transaction_report_state`
- `private.rank_dues_rate_history` — RLS enabled; no policy was recorded in the earlier policy audit, so its intended access path must be confirmed before restore.
- `private.storage_cleanup_state`

## Scheduled jobs (source)
1. Job 2: `1 17 * * *` — conditionally calls `public.process_daily_dues()` when `public.dues_settings.cash_operations_enabled` is true.
2. Job 4: `*/15 * * * *` — calls `private.auto_cleanup_on_database_threshold()`.

These jobs must not be enabled on the target until restore validation is complete. In particular, the daily dues job must not run twice against copied financial data.

## Realtime
Publication `supabase_realtime` includes these 11 application tables:
- `public.admin_audit_log`
- `public.chat_messages`
- `public.dues_settings`
- `public.information_messages`
- `public.member_profiles`
- `public.member_wallets`
- `public.p4_p5_p6_chat_messages`
- `public.p5_p6_chat_messages`
- `public.payment_submissions`
- `public.private_messages`
- `public.wallet_transactions`

A second publication, `supabase_realtime_messages_publication`, covers Supabase-managed Realtime message partitions. Do not manually recreate Supabase-managed internal partitions without platform guidance.

## Installed extensions observed
- `pg_cron 1.6.4`
- `pg_stat_statements 1.11`
- `pgcrypto 1.3`
- `plpgsql 1.0`
- `supabase_vault 0.3.1`
- `uuid-ossp 1.1`

Other extensions shown as available by the management API are not assumed to be installed.

## Partitioning
The Realtime `realtime.messages` table has date partitions observed for 2026-11-04 through 2026-11-10. These are platform-managed, not WEBKAS business tables.

## Restore implications
- Restore database structure and data first in a controlled, isolated target.
- Reconcile extensions, private schema, cron definitions, and Realtime publication membership deliberately.
- Keep cron jobs disabled during initial restore and validation; enable only after proving exactly-once daily dues behavior.
- Recreate Storage buckets and policies, then separately transfer and verify the 63 binary objects recorded in the prior checkpoint.
- Auth user identities/password hashes and Storage binaries require full-fidelity backup/import, not just copying public tables.
- Re-deploy Edge Functions and set secrets securely; do not place secrets in Git.
- Preserve the source project and Cloudflare production deployment until end-to-end sign-in, permissions, balances, arrears, payments, chat, and proof-image checks pass.

## Backup path decision
Supabase's documented within-Supabase migration path uses a dashboard backup or a CLI-generated SQL backup/restore; Storage binary objects and Edge Functions require separate handling. The current ChatGPT-connected Supabase actions do not provide a verified full project backup artifact or direct transfer of Auth credentials, Storage binaries, and function secrets. Therefore this audit does not initiate target writes or claim a backup exists.
