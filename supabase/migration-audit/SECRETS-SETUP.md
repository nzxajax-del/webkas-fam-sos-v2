# WEBKAS migration runner — credential and safety notes

> **HOLD — NOT AUTHORIZED FOR EXECUTION.** This document is a safety reference only. The recovery is not complete, and the migration workflow must not be dispatched under the current instructions.

## Current workflow gate

The workflow is `.github/workflows/webkas-supabase-migration.yml` on branch `supabase-migration-audit`.

- It is triggered by `workflow_dispatch` and requires the boolean input `confirm_migration` to be `true` (default: `false`).
- It does **not** require a marker file. Do not create `EXECUTE_MIGRATION` or any equivalent trigger file.
- Dispatching it performs writes to the **target** database and target Storage. It is a migration/restore operation, not a read-only audit. Do not dispatch it without fresh, explicit owner authorization after every recovery gate has passed.
- It does not deploy Edge Functions, transfer Edge Function secrets, change Cloudflare, or switch production traffic.
- The database restore script contains no explicit `LOCK TABLE` or `pg_advisory_lock` statement. It reads the source and writes the target; normal PostgreSQL read locks may still occur. This observation is not authorization to run it.

## Private GitHub repository secrets

If a future, explicitly authorized recovery run is approved, the workflow expects these repository secrets:

| Secret name | Purpose |
|---|---|
| `SOURCE_DB_URL` | Source PostgreSQL connection string |
| `TARGET_DB_URL` | Target PostgreSQL connection string |
| `SOURCE_SERVICE_ROLE_KEY` | Source backend-only Storage access |
| `TARGET_SERVICE_ROLE_KEY` | Target backend-only Storage access |

Store values only in GitHub's encrypted Repository Secrets. Never paste them into ChatGPT, repository files, issues, screenshots, or workflow logs. Do not send passwords or service-role keys in chat.

## Latest read-only audit — 2026-11-14

Projects:
- Source: `lzciyzibqbujshoizlbu` — `ACTIVE_HEALTHY`
- Target: `cdqmeenrwsbkcpclitgh` — `ACTIVE_HEALTHY`

Observed differences:
- Auth users / identities: source 84 / 84; target 88 / 88.
- Storage objects: source 63; target 0. The three target buckets exist, but they contain no objects.
- Edge Functions: source has 7 active functions; target has the same 7 names plus one extra. All seven matching function code hashes differ, and target versions are lower.
- Migration history: source has 105 recorded migrations; target has 20. Do not blindly replay migrations or infer schema parity from migration names.
- Core table row counts and data are not equal. Source and target are both active; the source is not a frozen snapshot.

The most recent migration execution (run #1, 2026-11-07) restored database rows and passed its Auth checksum stage, but Storage transfer failed because the source project returned `exceed_egress_quota`. The final parity stage was not completed. The latest audit workflow on this branch only validates syntax, build, and SQL against a temporary PostgreSQL test schema; it does not prove production migration parity.

## Remaining gates

Do not declare recovery complete until all of the following are independently verified:

1. Database schema and application data are reconciled against the source, with a tested restore and rollback plan.
2. Auth users, identities, password hashes, and login behavior are verified.
3. Every source Storage object is copied and verified by path, metadata, size, and SHA-256.
4. All 7 Edge Functions have matching, reviewed code and configuration; required secrets are provisioned securely and verified without exposing values.
5. Login and role-specific core workflows pass smoke/regression tests.
6. Production configuration is confirmed to use the target, and rollback is tested and ready.
7. The old database remains intact as a usable backup, with its ongoing scheduled jobs and cleanup behavior explicitly accounted for.

No production deployment, cutover, source write freeze, migration execution, member-data change, UI change, or feature change is authorized by this document.
