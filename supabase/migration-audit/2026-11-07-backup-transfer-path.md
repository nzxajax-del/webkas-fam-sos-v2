# WEBKAS FAM SOS V2 — Backup and migration path assessment
Date: 2026-11-07
Branch: supabase-migration-audit
Status: planning/audit only; no database or production writes performed.

## Scope
- Source Supabase project: `lzciyzibqbujshoizlbu` (Free, PostgreSQL 17.11, ap-southeast-1).
- Target Supabase project: `cdqmeenrwsbkcpclitgh` (Free, PostgreSQL 17.11, ap-northeast-1).
- Production app: Cloudflare Worker `https://webkas-fam-sos-v2.nzxajax.workers.dev/`.
- Target remains empty of application tables/functions at time of audit. Source remains authoritative.

## Verified backup and transfer constraints
1. Supabase Free projects do not have downloadable dashboard backups or automatic daily backups. Official Supabase guidance recommends manual CLI exports for Free projects.
2. `supabase db dump` runs a Supabase-filtered pg_dump. Its documented behavior excludes managed schemas, including `auth` and `storage`; default output is schema-only and custom roles/data require separate `--role-only` and `--data-only` exports. Therefore this CLI dump alone is not a complete WEBKAS backup.
3. The official within-Supabase migration guide separates database export, Edge Function transfer, and Storage object transfer. Storage metadata is in Postgres; object binaries in Storage buckets must be copied separately.
4. Auth user export can be viewed through SQL, but an ordinary CLI database dump does not include the managed Auth schema. Do not assume CSV export alone preserves password hashes, identity records, sessions, and provider configuration. A safe, supported way to preserve all current Auth accounts/password hashes between these two managed projects still needs to be selected and verified.
5. Supabase Storage CLI supports copying objects from a linked remote project; the documented migration command family uses `supabase storage cp`. Actual transfer requires source and target credentials and must be validated by object counts and checksums.
6. Edge Function source is available through the Supabase connector and is already present in the public GitHub repository under `supabase/deployed-functions-backup/`.

## Live Edge Function source verification
All seven deployed Edge Function `index.ts` files were fetched from the source project and compared byte-for-byte with the existing repository backups on this audit branch. Every comparison matched exactly:
- `member-register` v6 — SHA-256 `cac7d15e29bd2a553813f74808badf2ee3377de8644d514e2d1a035d0498c1ff`
- `cleanup-payment-proofs` v2 — SHA-256 `8f2e3e5c57359b84306f6f014d7035cd82b3b238bc9e3d32109934be1f25e368`
- `account-settings` v2 — SHA-256 `1cf93a054b51d5f1663ef46e7d37c7729fc478a8927207f7e24a0b5678cc8bc8`
- `review-payment` v6 — SHA-256 `749d2e61f5a32ebbce94f87d6a04565249665e658945b0f42a597b2c5182e13f`
- `delete-completed-payment-history` v1 — SHA-256 `56e343ec125f24d02289e3b22be3ca662676284a207af939fb6424934f917ea0`
- `admin-reset-member-password` v1 — SHA-256 `93796869150e60eedd4371ae1d12c15e13cf6d34aab8149f0f7c1f9336cb3d82`
- `review-member-registration` v2 — SHA-256 `49eb3830134bffe8e94e3722b8039631d77ca21f73427f771825668cc1ea62b1`

No function was deployed or modified. Function environment secrets were not read or copied. Before target deployment, recreate required environment variables securely in the target project. Review CORS configuration against the production Cloudflare Worker origin; `cleanup-payment-proofs` currently does not list the Worker origin in its allowlist.

## Safe migration sequence (not yet executed)
1. Resolve Auth preservation path and required source/target access.
2. Prepare manual logical database exports for roles, schema, and data from the source; store artifacts privately with short retention and never commit dumps to this public repository.
3. Transfer the three Storage buckets' object binaries separately and verify object counts, sizes, and sample checksums. Preserve bucket/object metadata through the database restore where supported.
4. Restore database schema/data to the empty target only after validating the export contents and target compatibility. Do not replay the repository's migration directory blindly: source history and repository migration files are known to be out of sync.
5. Recreate extensions, Auth settings, Edge Function secrets, seven Edge Functions, Realtime publication membership, and other project settings.
6. Keep `pg_cron` jobs disabled until restore verification. In particular, do not run the daily-dues processor until exactly-once behavior and ledger consistency are verified.
7. Compare source/target row counts and key invariants (84 profiles, 84 wallets, 1,201 wallet transactions, 1,082 daily dues, 235 payment submissions with 3 pending; exact figures may change while source remains live). Verify Auth user count, Storage objects, function versions, RLS/policies, triggers, and Realtime tables.
8. Only after successful verification, prepare a separate cutover plan for Cloudflare environment variables. Do not change production or the main branch without explicit approval.

## Hard safety boundaries
- Do not delete, pause, reset, or modify the source project.
- Do not enable cash-processing or cleanup cron jobs on target before verification.
- Do not copy any password, API secret, service-role key, personal access token, or database connection string into Git, chat, logs, or public artifacts.
- Do not commit SQL dumps, Auth exports, Storage binaries, or user/member data to this public repository.
- Do not deploy Edge Functions or change the production Cloudflare Worker as part of this audit.
- No target writes or data migration have been performed as part of this assessment.

## Current blocker / next user-intervention boundary
The remaining hard requirement is secure source/target credential access for an export-and-transfer runner, plus a verified Auth migration method that preserves current member sign-ins. The assistant-connected Supabase tools expose SQL and function source operations but do not provide a complete backup artifact, a direct Auth credential migration operation, or bulk Storage binary transfer. Do not ask the user to paste secrets into chat. If credentials are needed, ask the user to add them directly to a private runner's secret store or perform one narrowly-scoped dashboard action, then continue autonomously.

## Additional official path checked: project cloning
Supabase's newer “Restore to a new project” clone feature would preserve Auth users and hashed passwords, but official documentation marks it Beta and restricts it to paid-plan users with physical backups enabled. It also does not copy Storage objects, Edge Functions, Auth settings/API keys, Realtime settings, or extensions automatically. This is not an option for this project because the owner requires both projects to remain Free.

## Auth migration feasibility note
Supabase's Auth migration guidance confirms that user accounts and password hashes can be migrated through a full database backup or targeted SQL export/import (for example, pg_dump/psql), but it does not provide a one-size-fits-all auth-only script. The normal Supabase CLI `db dump` intentionally excludes managed `auth` and `storage` schemas. Any targeted Auth-schema dump must therefore be tested against the exact source/target Auth schema versions and target-managed objects before any target write. Never copy active sessions or refresh tokens blindly; the target JWT signing secret differs unless deliberately migrated, and copying signing secrets changes/regenerates API keys. Existing users may need to sign in again even when password hashes are preserved.

## Additional read-only Auth compatibility audit
Source and target Auth schema signatures match exactly at the catalog level: 27 tables, 271 columns, 110 constraints, and 111 indexes; the column signature, constraint signature, and index signature are identical. This materially improves the prospects of a controlled Auth data-only transfer, but does not replace a tested dump/restore rehearsal.

Source Auth row counts (counts only; no credential contents were read): 84 users, 84 identities, 135 sessions, 762 refresh tokens, 0 MFA factors, and 0 MFA recovery-code sets. Target counts are all zero.

One source-specific customization is missing from target: the source has a single non-internal trigger `auth.users.on_auth_user_created`, calling `public.handle_new_auth_user()`; target has no non-internal Auth trigger. The function creates `public.member_profiles` and `public.member_wallets` on new Auth-user insertion, sets pending/member defaults, and does not create ADM debt. A guarded, non-executed restore SQL file has been recorded at `supabase/migration-audit/restore-auth-customizations.sql`. Recreate this trigger only after the public schema/tables are restored and before enabling registration on target.

The source also has 135 active Auth session rows and 762 refresh-token rows. These are not required to preserve password-based account credentials and should not be copied blindly; plan for users to authenticate again after cutover unless a separate token/JWT continuity design is explicitly validated. The source and target JWT secrets/API keys are not assumed to match.

## Additional Storage audit
The source has three private buckets, all restricted to image uploads:
- `payment-proofs`: 5 MiB limit; 3 objects; 5,570,882 bytes.
- `profile-photos`: 3 MiB limit; 29 objects; 24,540,765 bytes.
- `registration-proofs`: 2 MiB limit; 31 objects; 26,212,302 bytes.
Total: 63 objects, 56,323,949 bytes (about 56.3 MB). All three buckets are private and allow JPEG, PNG, and WEBP.

Source has 9 custom policies on `storage.objects`; target currently has 0. A non-executed restore file has been captured at `supabase/migration-audit/restore-storage-policies.sql`. Recreate buckets through the Storage API (not by assuming a database dump transfers S3 binaries), transfer the object paths, then apply policies only after the required `public`/`private` helper functions and member tables are restored. Verify every object count and byte size; keep all buckets private.

## Edge Function deployment readiness
The seven deployed function entrypoint files are byte-for-byte identical to the existing GitHub backups on this audit branch. The functions only reference Supabase's standard runtime variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and/or `SUPABASE_SERVICE_ROLE_KEY`); no additional custom environment variable names were found. No secrets were read. Before deploying, verify the target project injects the standard variables and review the `cleanup-payment-proofs` CORS allowlist because it does not currently include the production Cloudflare Worker origin.
