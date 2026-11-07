# WEBKAS migration runner — required private secrets

The gated workflow is `.github/workflows/webkas-supabase-migration.yml` on branch `supabase-migration-audit`. It will not run until a dedicated marker file is added to that branch. The workflow has not been triggered.

## Add these four values as GitHub Repository Secrets

Repository: `nzxajax-del/webkas-fam-sos-v2`

GitHub path: Settings → Secrets and variables → Actions → Repository secrets → New repository secret.

| Secret name | Value to enter |
|---|---|
| `SOURCE_DB_URL` | Old Supabase project's PostgreSQL **Session pooler** connection string, including its database password |
| `TARGET_DB_URL` | New Supabase project's PostgreSQL **Session pooler** connection string, including its database password |
| `SOURCE_SERVICE_ROLE_KEY` | Old Supabase project's backend-only `service_role` key from Project Settings → API Keys |
| `TARGET_SERVICE_ROLE_KEY` | New Supabase project's backend-only `service_role` key from Project Settings → API Keys |

Use the connection string from the correct project for each secret. Do not use the publishable/anon key in place of a service-role key.

## Security and execution notes
- Never paste these values into ChatGPT, GitHub files, issue comments, screenshots, or workflow logs.
- These values belong only in GitHub's encrypted Repository Secrets store.
- No Supabase Personal Access Token is required by the prepared workflow.
- Database dump files (including Auth password hashes) are held only in the temporary GitHub Actions runner directory, are never uploaded as artifacts, and are deleted when the job exits.
- The workflow checks the target project reference and refuses to overwrite partial/different target data. It never deletes or modifies the source project.
- The Storage transfer keeps all buckets private, uses no overwrite for differing objects, and verifies every copied file by SHA-256.
- The workflow installs `pg_cron` but intentionally creates no scheduled jobs. Daily dues and cleanup jobs remain unscheduled until final ledger verification.
- The workflow does not deploy Edge Functions, change Cloudflare, or push to `main`.
- The workflow acquires a temporary PostgreSQL SHARE lock on all application, Auth-user/identity, and Storage tables before the snapshot. Reads remain available; writes/registrations/uploads are briefly held until the migration job finishes or is cancelled. The lock is released automatically even if a later step fails. The database script also checks source row-content signatures during export and after restore and stops if it detects changes.

Once these four secrets exist, the assistant can add the one-time marker file to start the workflow. No secret values need to be sent in chat. This is the only credential setup required from the owner; the runner handles export, import, temporary source write-locking, Storage verification, and cleanup automatically.
