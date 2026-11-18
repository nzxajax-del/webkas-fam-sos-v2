# WEBKAS FAM SOS V2 — read-only recovery checkpoint
Date: 2026-11-18 09:36 WIB
Repository: `nzxajax-del/webkas-fam-sos-v2`
Audit branch: `supabase-migration-audit`

## Scope and safety
This checkpoint records read-only observations only. No production deployment, database migration, source lock/freeze, member-data write, Storage transfer, Edge Function deployment, secret change, UI/feature change, or cutover was performed. The migration workflow was not dispatched. No migration trigger/marker file was created.

## Repository and workflow state
- Audit branch head before this checkpoint: `d8a6546bcd667e66e3444584b34d33c10240d8fc` (2026-11-15).
- Main head: `f16304d59e3a6db3c21307c148ccbc01301609b2` (2026-11-13).
- Compare: audit branch is diverged, 91 commits ahead and 15 behind main. Both branches report `protected=false`.
- Recursive tree checks on both audit and main found no path containing `EXECUTE_MIGRATION`.
- Latest audit workflow: run #43668881092, success (2026-11-15). It checked shell/YAML/JS syntax, built the frontend without deployment, and applied captured SQL to a temporary PostgreSQL test schema. It did not connect to production Supabase.
- Migration workflow is manual (`workflow_dispatch`) with required boolean `confirm_migration`, default `false`. It writes to target DB/Storage and is not a read-only preflight.
- Only migration execution found: run #42350733953 (2026-11-07), conclusion `failure`. DB restore and Auth account/identity checksum stage passed, but the Storage source inspection returned `exceed_egress_quota`; final inventory check failed, and subsequent cron/parity checks were skipped. This run did not restore Edge Functions/secrets or switch Cloudflare production.
- Latest Cloudflare deployment found: run #43429297310 (2026-11-13), success for main commit `f16304d...`. No later deployment run appeared in the latest 100 Actions runs.

## Supabase project health
Both projects are `ACTIVE_HEALTHY`, PostgreSQL 17.11:
- Source `lzciyzibqbujshoizlbu`, region `ap-southeast-1`.
- Target `cdqmeenrwsbkcpclitgh`, region `ap-northeast-1`.

## Current source-to-target data comparison
Counts from read-only SQL on 2026-11-18:

| Dataset | Source | Target |
|---|---:|---:|
| Auth users (not deleted) | 84 | 94 |
| Auth identities | 84 | 94 |
| Member profiles | 84 | 94 |
| Member wallets | 84 | 94 |
| Wallet transactions | 2,044 | 2,010 |
| Daily dues log | 2,006 | 1,834 |
| Payment submissions | 235 | 359 |
| Treasury history | 8 | 12 |
| Admin audit log | 637 | 894 |
| Storage objects | 63 | 15 |

Fingerprint reconciliation (only aggregate results recorded; no passwords, hashes, member identifiers, or object names included):
- Auth: 54 common user IDs have matching encrypted-password fingerprints; 14 common IDs have different fingerprints; 16 source-only; 26 target-only.
- Profiles: 61 common IDs match selected core fields; 7 common IDs differ; 16 source-only; 26 target-only.
- Wallets: 24 common member IDs match balance/arrears/date/ADM/exemption fields; 44 differ; 16 source-only; 26 target-only.
- Wallet transactions: 1,016 common IDs have matching selected row fingerprints; 1,028 source-only; 994 target-only.
- Daily dues by member/date: 1,448 matching pairs; 228 common pairs differ; 330 source-only; 158 target-only.
- Payment submissions: 193 common IDs match selected fields; 3 differ; 39 source-only; 163 target-only.
- Treasury history: no common row IDs; 8 source-only; 12 target-only.

These differences mean current DB/Auth parity and password continuity are not proven. Do not use the source as an immediate rollback target without reconciling post-restore changes.

## Storage
- Source inventory: 3 `payment-proofs`, 29 `profile-photos`, 31 `registration-proofs` (63 total).
- Target inventory: 13 `payment-proofs`, 2 `registration-proofs`, 0 `profile-photos` (15 total).
- Exact bucket + object-path matches between source and target: 0.
- Target bucket definitions exist and are private, but object counts/path comparison do not prove any source object was transferred. Binary download and SHA-256 verification remain outstanding.
- Current egress quota metrics are not exposed by the connected project metadata tools. The last migration workflow's source Storage API error remains the only direct transfer failure evidence.

## Edge Functions and secrets
The seven core function names are active in both projects, but versions and code hashes differ:
- `member-register`: source v8, target v2
- `cleanup-payment-proofs`: source v4, target v1
- `account-settings`: source v4, target v1
- `review-payment`: source v8, target v2
- `delete-completed-payment-history`: source v3, target v2
- `admin-reset-member-password`: source v3, target v2
- `review-member-registration`: source v4, target v2

All seven source/target code hashes differ. `verify_jwt` settings match for these seven. Target also has an extra `developer-password-reset` function v1. Connected tools do not expose runtime secret inventory or values; secret completeness is unverified.

## Daily dues and source cleanup behavior
- Both projects have `report_date=2026-11-18`, daily rate 1,000 UIC, and `cash_operations_enabled=true`.
- Both have active `webkas-daily-dues-wib` cron at `1 17 * * *` (00:01 WIB). Latest run for the 2026-11-17 dues date succeeded on both: 84 rows in source and 92 rows in target.
- Source DB size is approximately 17 MB. It also has active `webkas-db-threshold-cleanup` cron every 15 minutes. The cleanup state has `last_cleanup_at=null` and zero recorded deletions. The function's threshold is 80% of 500 MiB (approximately 400 MiB); below threshold it returns without deleting. If threshold is reached, the source function can delete chat messages, approved/rejected payment submissions, and linked `payment_credit` transactions. This job was not changed or disabled. The source is live, not a frozen backup.
- Target has only the daily-dues cron; its cleanup function is a no-op for the retired chat/payment cleanup.

## Production and remaining gates
- `src/lib/supabase.js` on main defaults to target project URL `https://cdqmeenrwsbkcpclitgh.supabase.co`.
- The last confirmed Cloudflare deployment was successful on 2026-11-13. Runtime Worker configuration was not independently inspected, and no login/role-specific core-feature smoke test is available from the connected tools.
- Remaining gates: reconcile Auth/password fingerprints and application data; transfer all 63 source Storage objects and verify path/metadata/size/SHA-256; align and review all seven Edge Functions and provision/verify secrets in a private secret store; test login and core workflows with safe test accounts; independently verify Worker runtime; and prepare a rollback plan accounting for target-only changes and source cleanup cron.

## Decision
Recovery is **not complete**. Do not dispatch the migration workflow, deploy, merge this branch, lock/freeze the source, or cut over without a new explicit authorization after all gates pass.
