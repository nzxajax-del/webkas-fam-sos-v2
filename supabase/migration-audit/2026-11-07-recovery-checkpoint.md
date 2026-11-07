# WEBKAS FAM SOS V2 — Recovery checkpoint (2026-11-07)

## Scope and production safety
- All work in this checkpoint is isolated to the Supabase target project `cdqmeenrwsbkcpclitgh` and Git branch `supabase-migration-audit`.
- Production Cloudflare deployment and its database connection have not been changed.
- Source Supabase project `lzciyzibqbujshoizlbu` has not been locked, paused, deleted, or modified by this checkpoint.
- No member balances, arrears, payment statuses, dues rows, or source Storage objects were modified.
- Rollback remains available by leaving production on its existing source connection; target-only function/RPC changes do not affect the current production runtime.

## Verified database restore
- Auth users: 84 on target.
- Auth identities: 84 on target.
- The lock-free restore workflow verified application table row counts and Auth account/identity checksums.
- The workflow run remains failed overall because Storage binary transfer and final inventory did not pass.
- Target application data is a snapshot from the restore run. It must be reconciled with any source writes made after that snapshot before cutover.

## Storage
- Source inventory from read-only SQL: 3 private buckets and 63 objects:
  - `payment-proofs`: 3 objects
  - `profile-photos`: 29 objects
  - `registration-proofs`: 31 objects
- Target inventory after isolated bucket-preparation workflow: all 3 private buckets created and verified with matching size/MIME restrictions; object count remains 0.
- Source Storage API returned `exceed_egress_quota`; the migration script cannot inspect or download source objects while this platform restriction remains.
- The Storage migration script was adjusted on this audit branch to prepare all target buckets before it checks source Storage access.
- A separate target-only GitHub Actions workflow created and verified the three private buckets successfully; it did not read or modify source Storage objects.
- Do not cut over until every source object has been copied and SHA-256 verified.

## Edge Functions
- Retrieved the seven active function versions directly from the source project and deployed them to the target:
  - `member-register`
  - `cleanup-payment-proofs`
  - `account-settings`
  - `review-payment`
  - `delete-completed-payment-history`
  - `admin-reset-member-password`
  - `review-member-registration`
- Target function inventory verified all seven as ACTIVE.
- The target `cleanup-payment-proofs` function was patched to allow the current Cloudflare Workers origin.
- The corresponding function sources are being kept in the repository under `supabase/functions`.
- Function invocation smoke tests with real authenticated test accounts remain outstanding; do not treat deployment as proof of end-to-end operation.

## Security
- Enabled RLS on the four target private tables:
  - `private.admin_bootstrap_tokens`
  - `private.admin_transaction_report_state`
  - `private.rank_dues_rate_history`
  - `private.storage_cleanup_state`
- Verified `anon` and `authenticated` have no direct SELECT/INSERT privileges on those private tables.
- Added migration `revoke_anon_execute_guarded_webkas_rpcs`; verified anonymous EXECUTE is false and authenticated EXECUTE remains true for five guarded RPCs:
- Added migration `revoke_anon_select_member_leave_requests`; verified anonymous SELECT is false while authenticated SELECT remains true. Public branding remains readable anonymously by design.
  - `admin_delete_information_message(uuid)`
  - `admin_delete_member_leave_request(uuid)`
  - `admin_get_rank_dues_rates()`
  - `admin_schedule_rank_dues_rate(text,numeric)`
  - `get_rank_daily_rate(text)`
- Remaining Supabase Security Advisor findings require review:
  - 15 authenticated-callable SECURITY DEFINER functions (their authorization logic must be checked individually; do not blindly revoke authenticated EXECUTE because the app calls guarded RPCs).
  - Leaked-password protection is disabled in Auth settings.
  - RLS-without-policy findings on private tables and `public.member_rank_rate_history`; direct anon/authenticated grants were not observed on private tables.
- No blanket policy or permission changes were applied.

## Unresolved business-rule reconciliation
- Source and target currently both show base daily dues of 1000 UIC and P4 rate history of 600 UIC.
- Earlier user-approved rule context says P4 is 50% of the base (500 UIC when base is 1000). This discrepancy was not changed or backdated; resolve it with a forward-only effective date before cutover.

## Cutover gates
1. Restore Storage object binaries and verify exact path/metadata inventory plus SHA-256.
2. Reconcile source changes made after the target snapshot; repeat row-level parity checks without locking source.
3. Verify all target buckets/policies, Auth settings, RLS/grants, RPC authorization, Realtime, extensions, and required scheduler configuration.
4. Run frontend build and authenticated smoke tests for login, registration, profile, chat, payment review, dues/arrears, leave requests, and treasury history.
5. Confirm target free-tier capacity and obtain a fresh rollback snapshot.
6. Only then perform a controlled connection switch; retain source project and its data as rollback.

## Rollback
- Until cutover, rollback is simply to keep the current production deployment and source connection unchanged.
- After any future cutover, preserve the old source project and deployable previous frontend build. If target health checks fail, restore the previous frontend environment/configuration and route production back to the source. Do not attempt reverse data sync automatically; reconcile writes made during the cutover window first.
