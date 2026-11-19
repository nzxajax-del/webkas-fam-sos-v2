# WEBKAS FAM SOS V2 — read-only recovery checkpoint (2026-11-19)

## Scope and safety

This checkpoint records read-only checks of repository `nzxajax-del/webkas-fam-sos-v2`, branch `supabase-migration-audit`, GitHub Actions, and both Supabase projects.

No database write, source freeze/lock, migration, Storage transfer, Edge Function deployment, secret change, production deployment, UI change, feature change, or cutover was performed. No `EXECUTE_MIGRATION` marker was created.

The Supabase skill documentation was not available in the connected skill catalog during this run; SQL below was restricted to SELECT/catalog reads.

## Project health and current scheduler state

- Source `lzciyzibqbujshoizlbu`: ACTIVE_HEALTHY, PostgreSQL 17.11, database size 16.91 MiB.
- Target `cdqmeenrwsbkcpclitgh`: ACTIVE_HEALTHY, PostgreSQL 17.11, database size 16.32 MiB.
- Both have `cash_operations_enabled=true`, daily amount 1,000 UIC, and `report_date=2026-11-19`.
- Both daily dues jobs are active at `1 17 * * *` UTC (00:01 WIB). Latest logged due date is 2026-11-18: source 84 rows; target 96 rows.
- Source also has `webkas-db-threshold-cleanup` every 15 minutes. Its latest run at 2026-11-19 02:45 UTC succeeded, but `private.storage_cleanup_state.last_cleanup_at` remains NULL and all recorded deletion counters remain zero. The function threshold is 80% of 500 MiB (400 MiB); current source DB is only 16.91 MiB, so the cleanup branch is not triggered. This was not changed.
- Target has no database-threshold cleanup cron.

## Current row counts

| Area | Source | Target |
|---|---:|---:|
| Auth users | 84 | 96 |
| Auth identities | 84 | 96 |
| Member profiles | 84 | 96 |
| Member wallets | 84 | 96 |
| Wallet transactions | 2,119 | 2,099 |
| Daily dues log | 2,090 | 1,915 |
| Payment submissions | 235 | 363 |
| Treasury history | 8 | 17 |
| Storage objects | 63 | 1 |

Fingerprint comparison (values were hashed in SQL; raw password hashes and member data were not returned):

- 67 Auth user IDs are shared. 54 shared password fingerprints match and 13 differ. All 67 shared identity records match. There are 17 source-only IDs and 29 target-only IDs. All 17 source-only IDs have a `member_permanently_deleted` audit entry in target; this explains their absence there, but does not make the databases interchangeable for rollback.
- Of 67 shared profiles, 60 match on the compared fields and 7 differ.
- Of 67 shared wallets, 23 match and 44 differ.
- Of 1,728 shared member/date dues-log pairs, 1,468 match and 260 differ.
- Of 194 shared payment submissions, 191 match and 3 differ.
- Of 1,010 shared wallet transactions, all 1,010 match; 1,109 rows are source-only and 1,089 are target-only.
- No source Treasury History row matched target by ID or normalized content fingerprint.

These differences are unresolved for migration parity. In particular, old login continuity is not proven for the 13 shared accounts with different password fingerprints.

## Storage inventory

| Bucket | Source | Target |
|---|---:|---:|
| `payment-proofs` | 3 | 1 |
| `profile-photos` | 29 | 0 |
| `registration-proofs` | 31 | 0 |
| **Total** | **63** | **1** |

No bucket/path pair matched between source and target. Binary transfer and SHA-256 verification remain unavailable through the connected tools. The historical migration attempt still fails at source Storage inspection with `exceed_egress_quota`; the final parity step was not completed.

## Edge Functions and secrets

All seven expected functions are ACTIVE in both projects. Source/target versions:

| Function | Source | Target | Retrieved source/target code |
|---|---:|---:|---|
| `member-register` | 8 | 2 | Different |
| `cleanup-payment-proofs` | 4 | 1 | Different |
| `account-settings` | 4 | 1 | Same file content |
| `review-payment` | 8 | 2 | Different |
| `delete-completed-payment-history` | 3 | 2 | Different |
| `admin-reset-member-password` | 3 | 2 | Different |
| `review-member-registration` | 4 | 2 | Different |

Target also has an additional `developer-password-reset` function. The seven expected functions use the same environment-variable names in source and target; values of runtime secrets cannot be inspected through the available connector. The target `cleanup-payment-proofs` code includes the Cloudflare Workers origin in its CORS allowlist, while the current source version does not. Do not blindly overwrite the target function with source code without preserving this behavior and reviewing the full diff.

## Migration history and schema drift

- Source records 105 migrations; target records 24.
- Target contains four migrations recorded on 2026-11-16 that are not present as files in either `main` or this audit branch: leave-request visibility hardening, disabling profile-photo uploads, assistant rank-change restrictions, and admin-only member directory.
- Target's schema intentionally differs from source (including retired chat tables and target-only password-reset support). Do not replay the source migration history blindly.

## Repository and Actions

- Audit branch head: `db8d92f1f9b4afd130bba10f6aacb9512d495e57` (2026-11-18).
- Main head: `f16304d59e3a6db3c21307c148ccbc01301609b2` (2026-11-13).
- Audit branch is 92 commits ahead and 15 behind main. Both branches currently have branch protection disabled.
- No `EXECUTE_MIGRATION` path exists in either branch tree.
- Latest audit workflow run #96 succeeded on 2026-11-18. It validates shell/YAML/JavaScript syntax, builds the frontend without deployment, and tests captured SQL on a temporary PostgreSQL schema; it does not test production migration parity.
- The migration workflow is manual and requires `confirm_migration=true` (default false). It writes to target and is not a read-only audit.
- The only known migration execution, run #1 on 2026-11-07, restored database rows and passed the Auth checksum stage, but Storage inspection failed with `exceed_egress_quota`; the final parity step failed. No new migration execution was found in the latest 100 Actions runs.
- Open PR #61 targets the audit branch, is not mergeable, and changes `src/App.jsx`, functions, and migrations. It was not merged or modified.

## Production and security notes

- `main/src/lib/supabase.js` defaults to the target project URL and publishable key.
- Latest Cloudflare production deploy found: run #380, successful on 2026-11-13 for main commit `f16304d`. No newer deployment was found in the latest 100 Actions runs.
- Runtime Worker configuration and authenticated login/role-specific smoke tests were not independently verified.
- Supabase security advisors report leaked-password protection disabled on both projects. No advisor remediation was applied in this audit.

## Remaining gates

1. Reconcile the 13 shared Auth password-fingerprint differences and verify login using controlled test accounts.
2. Reconcile wallet, dues-log, payment-submission, Treasury History, and target-only/source-only records with explicit accounting controls.
3. Transfer all 63 source Storage objects to the intended target locations and verify path, metadata, size, and SHA-256.
4. Review and reconcile all seven Edge Function source files, CORS behavior, and required secrets in a secure secret store.
5. Test login and critical role-specific workflows against target; independently verify production Worker runtime.
6. Prepare and test rollback against target-side changes while preserving the source project and accounting for its active cleanup/daily-dues jobs.

**Status: NOT READY.** No migration, cutover, source lock/freeze, production deployment, UI/feature change, data mutation, Storage transfer, Edge Function deployment, or secret operation is authorized by this checkpoint.
