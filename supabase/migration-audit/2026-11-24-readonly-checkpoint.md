# Read-only recovery checkpoint — 2026-11-24

**Scope:** audit and preparation only. This checkpoint does not authorize or perform a database restore, Storage transfer, Edge Function deployment, secret change, source lock, production cutover, or UI/feature change.

## Project state

- Source project: `lzciyzibqbujshoizlbu`, region `ap-southeast-1`, PostgreSQL `17.11.0.003`, status `ACTIVE_HEALTHY`.
- Target project: `cdqmeenrwsbkcpclitgh`, region `ap-northeast-1`, PostgreSQL `17.11.0.018`, status `ACTIVE_HEALTHY`.

## Current read-only row inventory

| Item | Source | Target |
|---|---:|---:|
| Auth users | 84 | 86 |
| Auth identities | 84 | 86 |
| Member profiles | 84 | 86 |
| Member wallets | 84 | 86 |
| Wallet transactions | 2,495 | 2,294 |
| Daily dues log | 2,510 | 2,109 |
| Payment submissions | 235 | 406 |
| Treasury history | 8 | 11 |
| Storage objects | 63 | 2 |
| Applied migration versions | 105 | 24 |

Storage bucket inventory (all three buckets are private and their size/MIME restrictions match):

| Bucket | Source | Target |
|---|---:|---:|
| payment-proofs | 3 | 2 |
| profile-photos | 29 | 0 |
| registration-proofs | 31 | 0 |

No full object SHA-256 parity report is available. Storage is not complete.

## Schema and restore-workflow blocker

The source still has six chat-related public tables (45 rows total): `chat_messages`, `private_conversations`, `private_messages`, `private_chat_hidden`, `p5_p6_chat_messages`, and `p4_p5_p6_chat_messages`. Those tables are absent from the target. The target has `public.developer_password_reset_tokens`, which is absent from the source.

The audit-branch restore script currently:
- dumps the full `public,private` schemas and their data from source;
- includes all six retired chat tables in `APP_SIGNATURE_SQL` and `APP_COUNTS_SQL`;
- computes the target signature before deciding whether an existing target already matches.

Because the live target is non-empty but lacks the chat tables referenced by the signature, the current restore preflight cannot safely validate it. If the target were emptied and the full source dump were restored, chat schema/data would be reintroduced, contrary to the retained no-chat requirement. Do not run the workflow until its restore scope and parity logic are reconciled without bringing chat back.

The workflow also does not deploy the seven Edge Functions, provision/verify their secrets, run member login/feature smoke tests, perform production cutover, or prove rollback. A successful static audit CI is not a migration-readiness pass.

## Edge Functions

All seven required function slugs are ACTIVE in both projects. Their deployed SHA-256 values differ for all seven; the `verify_jwt` flags match. The target has an additional `developer-password-reset` function. Runtime secrets cannot be inventoried through the available connection. No function or secret was changed.

## Security observations

The source catalog reports RLS disabled on:
- `private.admin_bootstrap_tokens`
- `private.storage_cleanup_state`
- `private.admin_transaction_report_state`

A separate privilege check found no anon/authenticated SELECT, INSERT, UPDATE, or DELETE grants on these three tables; anon also lacks USAGE on schema `private`. This is a hardening gap, not evidence that those roles can currently read these rows. The target has RLS enabled on all three. Do not apply the following source hardening SQL automatically; first confirm no other intended database role depends on the current behavior:

```sql
ALTER TABLE "private"."admin_bootstrap_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."storage_cleanup_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."admin_transaction_report_state" ENABLE ROW LEVEL SECURITY;
```

Both projects also report leaked-password protection disabled. The source has 15 and target 11 SECURITY DEFINER functions callable by authenticated users according to the Supabase security advisor; each must be reviewed against intended RPC access rather than blanket-revoked.

## Repository and Actions

- `main`: `6da3a44db1f825110d5f013c0580247ecf0e5d4c`.
- `supabase-migration-audit`: `4626240d64894cb3976e8b42cca91bb414d3abd8`.
- Audit branch is 93 commits ahead and 16 behind main; both branches report branch protection disabled.
- No `EXECUTE_MIGRATION` path exists in either branch tree.
- Latest audit checks run `44447646786` succeeded on 2026-11-19; its tests use a temporary PostgreSQL schema and a frontend build, not live database restore.
- Latest main build `44965787987` and Cloudflare deployment `44965787998` succeeded on 2026-11-22.
- No Supabase migration-execution workflow run appears in the latest 100 Actions runs. The historical Storage transfer failure on 2026-11-07 remains unresolved.
- The audit-branch migration workflow is manual (`workflow_dispatch`) and requires `confirm_migration=true`, default `false`. It was not run.

## Production and rollback

Main's `src/lib/supabase.js` defaults to the target project URL. The Cloudflare deployment workflow does not pass a separate `VITE_SUPABASE_URL` override; the 2026-11-22 deployment succeeded. This is evidence that the built app is configured for the target, but the live Worker runtime was not independently inspected. No controlled login/feature smoke test was performed. Rollback is not ready because source and target have divergent member/financial data and the source remains active.

## Source schedules

- Source: `webkas-daily-dues-wib` active at `1 17 * * *`; `webkas-db-threshold-cleanup` active every 15 minutes.
- Target: `webkas-daily-dues-wib` active at `1 17 * * *`; no threshold-cleanup job listed.

## Conclusion

Recovery is **not ready**. Required blockers: reconcile Auth/member/financial data; redesign restore scope to preserve the no-chat state; copy and SHA-256 verify all 63 Storage objects; review/deploy the seven matching Edge Functions and securely verify secrets; run controlled login/core-feature tests; independently verify the Worker runtime; and prove a rollback plan while retaining the old database.

No production, source, target, member data, Storage objects, secrets, Edge Functions, UI, or application features were changed by this audit.
