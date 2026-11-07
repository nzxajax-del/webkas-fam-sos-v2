# WEBKAS Supabase migration checkpoint — 2026-11-07

## Scope
Read-only verification only. No database writes, schema changes, Auth changes, Storage changes, Edge Function deployments, secrets changes, production deployment, or cutover were performed.

## Live project state
- Source project: `lzciyzibqbujshoizlbu` — `ACTIVE_HEALTHY`, PostgreSQL 17.11, region `ap-southeast-1`.
- Target project: `cdqmeenrwsbkcpclitgh` — `ACTIVE_HEALTHY`, PostgreSQL 17.11, region `ap-northeast-1`.
- Both projects remain on Free plans according to the connected account review.

## Source inventory (rechecked)
- Public tables: 19; all 19 have RLS enabled.
- Auth users: 84.
- Storage buckets: 3.
- Storage objects: 63.
- Public routines: 37.
- Public triggers: 18.
- Public RLS policies: 45.
- Earlier source inventory also recorded 104 applied migration-history entries and 7 active Edge Functions.

## Target inventory (rechecked)
- Public application tables: 0.
- Edge Functions: 0.
- Migration history currently contains only two platform records:
  - `20261107001949 restrict_rls_auto_enable_execution`
  - `20261107001954 restrict_rls_auto_enable_execution`

## Repository preflight status
- A manual-only workflow exists on branch `supabase-migration-audit` at `.github/workflows/safe-preflight.yml`.
- It has read-only repository permissions, installs dependencies in an ephemeral runner, builds the frontend, and uploads a short-lived report.
- It does not connect to Supabase, read secrets, write data, or deploy.
- It has not been executed. GitHub manual `workflow_dispatch` requires the workflow file to exist on the repository's default branch. Moving it to `main` would be unsafe without a separate deploy-trigger review because the repository has an existing Cloudflare deploy workflow. Therefore do not merge or copy it to `main` merely to make the Run workflow button appear.

## Migration blockers — do not bypass
1. The source migration history (104 entries) does not match the repository migration folder (68 files); the folder must not be replayed blindly.
2. A complete database backup/export has not been obtained or verified.
3. Auth export/import preserving user UUIDs, password hashes, and identities is not available through the current connected actions.
4. Storage object binary export/import is not available through the current connected actions.
5. Edge Function source is inspectable, but secure transfer of all function secrets is not available through the current connected actions.
6. Triggers, policies, grants, private-schema objects, cron jobs, and Realtime publication membership need a verified full-fidelity export/import plan.

## Safe next gate
Before any target writes, obtain a full source backup and independently verify its contents; prepare a restore plan that covers schema, data, Auth, Storage binaries, functions/secrets, policies, triggers, cron, and Realtime; then validate the restore on a non-production target. Keep the existing Cloudflare production deployment and current source project untouched until cutover checks pass.
