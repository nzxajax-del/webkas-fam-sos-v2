# WEBKAS FAM SOS V2 — read-only recovery checkpoint

Audit date: 2026-11-15 (Asia/Jakarta)  
Repository: `nzxajax-del/webkas-fam-sos-v2`  
Audit branch: `supabase-migration-audit`  
Status: **HOLD — recovery is not complete; no migration or cutover is authorized.**

## Scope and safety

This checkpoint records read-only inspection only. No Supabase database writes, migrations, source locks/freezes, member-data changes, Storage uploads/deletes, Edge Function deployments, secret changes, Cloudflare deployment, production cutover, or UI/feature changes were performed.

No `EXECUTE_MIGRATION` file was created. The repository content lookup returned 404 for both the repository-root path and `supabase/migration-audit/EXECUTE_MIGRATION`.

## Repository and branch

- The repository is public and its default branch is `main`.
- The branch `supabase-migration-audit` exists.
- Comparing `main` to the audit branch reports **diverged: 88 commits ahead and 15 behind**. Do not merge this branch into `main` without a separate file-by-file review.
- The current `main` commit returned by the compare is `f16304d59e3a6db3c21307c148ccbc01301609b2` (2026-11-13).
- The branch-specific safety-document commit inspected is `2af72063ab028bb078dfcb313f97e7fee31fe7cd`. The branch-search connector returns branch names but not the current branch-head SHA, so this commit is not asserted to be the branch head.
- `supabase/migration-audit/final-migration-readiness-status.json` still has an audit date of 2026-11-07 and contains stale target-empty statements. It is retained as historical evidence; use this newer checkpoint for the 2026-11-15 observations.

## GitHub Actions safety review

The branch workflow `.github/workflows/webkas-supabase-migration.yml` is manual-only (`workflow_dispatch`) and requires `confirm_migration=true`; the default is `false`. It writes to the target database and target Storage. It does not deploy Edge Functions, transfer their secrets, change Cloudflare, or switch production traffic. It was not dispatched.

The workflow invokes `scripts/restore-supabase-database.sh` for the restore and again for final verification. The script's guard is fail-closed:
- If the target is empty, it exports the source, verifies the source snapshot did not change during export, and restores into the target.
- If the target is non-empty, it skips only when application-row and Auth signatures exactly match the current source snapshot.
- If the target is partial or differs, it exits without overwriting or truncating the target.
- The script contains no explicit source `LOCK TABLE` or source advisory-lock statement. It was not executed; normal database reads by dump tools are not a reason to run it under the current no-lock/no-migration instruction.

The Storage transfer script is designed to keep buckets private, avoid overwriting different target objects, and verify copied object bytes with SHA-256. It was not executed.

The separate `.github/workflows/migration-audit-checks.yml` is a non-deployment check: shell/YAML/JavaScript syntax, frontend build, and SQL checks against a temporary PostgreSQL container. It does not connect to production Supabase or deploy Cloudflare.

The available GitHub connector does not expose a repository-wide list of recent workflow runs. Combined commit-status lookups for the inspected main and audit commits returned no status entries. A known Cloudflare deployment job, run ID `43175973168`, was fetched and its build and Cloudflare deploy steps completed successfully. This does not independently prove that it is the newest run or verify the live Worker environment.

## Supabase project health and current source inventory

Both projects reported `ACTIVE_HEALTHY`:
- Source `lzciyzibqbujshoizlbu`, PostgreSQL 17.11, region `ap-southeast-1`.
- Target `cdqmeenrwsbkcpclitgh`, PostgreSQL 17.11, region `ap-northeast-1`.

The source project is currently accessible for read-only SQL. The target project metadata and Edge Function inventory were accessible, but target SQL reads returned a permission error during this run. Therefore target row and Storage counts below are explicitly the **last recorded 2026-11-14 snapshot**, not a fresh 2026-11-15 verification.

Source live counts on 2026-11-15:
- Auth users: 84
- `public.member_profiles`: 84
- `public.member_wallets`: 84
- `public.wallet_transactions`: 1,816
- `public.daily_dues_log`: 1,754
- `public.payment_submissions`: 235
- `public.treasury_history`: 8
- `storage.objects`: 63 (3 `payment-proofs`, 29 `profile-photos`, 31 `registration-proofs`)

Source daily-dues state:
- `dues_settings.report_date = 2026-11-15`
- Daily amount: 1,000 UIC
- `cash_operations_enabled = true`
- Latest `due_date`: 2026-11-14, with 84 rows and zero duplicate member/date entries.
- The daily job `webkas-daily-dues-wib` is active at `1 17 * * *` (00:01 WIB). Its 2026-11-15 00:01 WIB execution succeeded.
- The source database is approximately 17 MB.

The source also has active job `webkas-db-threshold-cleanup` at `*/15 * * * *`. Its function is configured to act at 80% of a 500 MiB quota (400 MiB); at the observed 17 MB it returns without cleanup. If the threshold is reached, the function can delete chat messages, approved/rejected payment submissions, and linked `payment_credit` wallet transactions. The job remains active and was not changed. The source is therefore still an active database, not a frozen rollback snapshot.

## Target last-known state and parity

The latest recorded 2026-11-14 audit note reports:
- Target Auth users/profiles/wallets: 88 each, compared with source 84 at that time.
- Target Storage objects: 0, compared with source 63.
- Source migration history: 105 records; target: 20 records.

These values were not re-queried today because target SQL access was denied. Current database/Auth parity and current target Storage object count remain unverified. The source continues to advance daily, so an old snapshot is not a current rollback copy.

## Edge Functions

All seven matching function names were listed as active in both projects. Source vs target versions:

| Function | Source | Target |
|---|---:|---:|
| `member-register` | 8 | 2 |
| `cleanup-payment-proofs` | 4 | 1 |
| `account-settings` | 4 | 1 |
| `review-payment` | 8 | 2 |
| `delete-completed-payment-history` | 3 | 2 |
| `admin-reset-member-password` | 3 | 2 |
| `review-member-registration` | 4 | 2 |

All seven matching code hashes differ. Their `verify_jwt` settings match, but code parity is not established. The target also has an additional active `developer-password-reset` function (version 1). The available Supabase actions do not expose a runtime-secret inventory, so required Edge Function secrets and their completeness cannot be verified.

## Production and remaining gates

The `main` file `src/lib/supabase.js` defaults to target project `cdqmeenrwsbkcpclitgh`. A successful Cloudflare deployment job was observed, but live Worker environment variables were not independently inspected. No verified member-login or role-specific core-feature smoke test is available.

Recovery remains blocked on:
1. Fresh target SQL access and a full source-to-target schema/data/Auth reconciliation.
2. A complete Storage transfer of all 63 source objects, followed by path, metadata, size, and SHA-256 verification.
3. Matching reviewed code for all seven Edge Functions and secure verification/provisioning of their required secrets.
4. Successful login and role-specific core workflow tests.
5. Independently verified production Worker configuration and a tested rollback plan that accounts for post-snapshot writes and active source jobs.
6. A usable, current source backup; the active source cleanup schedule must be accounted for without changing it under the current authorization.

**Do not dispatch the migration workflow, create a marker/trigger file, merge this branch, change secrets, alter either database, deploy functions, or cut over production under this checkpoint. Fresh explicit authorization is required after every recovery gate is independently passed.**
