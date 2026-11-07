#!/usr/bin/env bash
set -Eeuo pipefail
set +x

: "${SOURCE_DB_URL:?SOURCE_DB_URL is required}"
: "${TARGET_DB_URL:?TARGET_DB_URL is required}"

if [[ "$SOURCE_DB_URL" != *"lzciyzibqbujshoizlbu"* ]]; then
  echo "Refusing to run: SOURCE_DB_URL does not identify the audited source project."
  exit 1
fi
if [[ "$TARGET_DB_URL" != *"cdqmeenrwsbkcpclitgh"* ]]; then
  echo "Refusing to run: TARGET_DB_URL does not identify the audited target project."
  exit 1
fi

command -v docker >/dev/null || { echo "Docker is required."; exit 1; }
command -v npx >/dev/null || { echo "Node/npm are required."; exit 1; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

docker pull postgres:17 >/dev/null

db_query() {
  local url="$1"
  local sql="$2"
  docker run --rm --network host \
    -e DB_URL="$url" -e DB_SQL="$sql" postgres:17 \
    sh -ec 'psql "$DB_URL" -X -A -t -v ON_ERROR_STOP=1 -c "$DB_SQL"' | tr -d '\r'
}

AUTH_SCHEMA_SIGNATURE_SQL=$(cat <<'SQL'
SELECT
  (SELECT count(DISTINCT table_name)::text || ':' || count(*)::text || ':' ||
          md5(string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable,
                         '|' ORDER BY table_name, ordinal_position))
   FROM information_schema.columns WHERE table_schema = 'auth')
  || '|' ||
  (SELECT count(*)::text || ':' ||
          md5(coalesce(string_agg(r.relname || '.' || c.conname || ':' || pg_get_constraintdef(c.oid),
                                  '|' ORDER BY r.relname, c.conname), ''))
   FROM pg_constraint c
   JOIN pg_class r ON r.oid = c.conrelid
   JOIN pg_namespace n ON n.oid = r.relnamespace
   WHERE n.nspname = 'auth')
  || '|' ||
  (SELECT count(*)::text || ':' ||
          md5(coalesce(string_agg(indexname || ':' || indexdef, '|' ORDER BY indexname), ''))
   FROM pg_indexes WHERE schemaname = 'auth');
SQL
)

APP_SIGNATURE_SQL=$(cat <<'SQL'
SELECT md5(
  (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.member_profiles t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.dues_settings t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.member_wallets t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.wallet_transactions t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.daily_dues_log t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.payment_submissions t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.admin_audit_log t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.dues_rate_history t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.app_branding_settings t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.chat_messages t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.private_conversations t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.private_messages t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.private_chat_hidden t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.p5_p6_chat_messages t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.p4_p5_p6_chat_messages t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.member_rank_rate_history t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.information_messages t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.member_leave_requests t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM public.treasury_history t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM private.admin_bootstrap_tokens t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM private.storage_cleanup_state t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM private.admin_transaction_report_state t)
  || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text), '')) FROM private.rank_dues_rate_history t)
);
SQL
)

APP_COUNTS_SQL=$(cat <<'SQL'
SELECT string_agg(table_name || '=' || row_count::text, '|' ORDER BY table_name)
FROM (
  SELECT 'public.member_profiles' table_name,count(*) row_count FROM public.member_profiles
  UNION ALL SELECT 'public.dues_settings',count(*) FROM public.dues_settings
  UNION ALL SELECT 'public.member_wallets',count(*) FROM public.member_wallets
  UNION ALL SELECT 'public.wallet_transactions',count(*) FROM public.wallet_transactions
  UNION ALL SELECT 'public.daily_dues_log',count(*) FROM public.daily_dues_log
  UNION ALL SELECT 'public.payment_submissions',count(*) FROM public.payment_submissions
  UNION ALL SELECT 'public.admin_audit_log',count(*) FROM public.admin_audit_log
  UNION ALL SELECT 'public.dues_rate_history',count(*) FROM public.dues_rate_history
  UNION ALL SELECT 'public.app_branding_settings',count(*) FROM public.app_branding_settings
  UNION ALL SELECT 'public.chat_messages',count(*) FROM public.chat_messages
  UNION ALL SELECT 'public.private_conversations',count(*) FROM public.private_conversations
  UNION ALL SELECT 'public.private_messages',count(*) FROM public.private_messages
  UNION ALL SELECT 'public.private_chat_hidden',count(*) FROM public.private_chat_hidden
  UNION ALL SELECT 'public.p5_p6_chat_messages',count(*) FROM public.p5_p6_chat_messages
  UNION ALL SELECT 'public.p4_p5_p6_chat_messages',count(*) FROM public.p4_p5_p6_chat_messages
  UNION ALL SELECT 'public.member_rank_rate_history',count(*) FROM public.member_rank_rate_history
  UNION ALL SELECT 'public.information_messages',count(*) FROM public.information_messages
  UNION ALL SELECT 'public.member_leave_requests',count(*) FROM public.member_leave_requests
  UNION ALL SELECT 'public.treasury_history',count(*) FROM public.treasury_history
  UNION ALL SELECT 'private.admin_bootstrap_tokens',count(*) FROM private.admin_bootstrap_tokens
  UNION ALL SELECT 'private.storage_cleanup_state',count(*) FROM private.storage_cleanup_state
  UNION ALL SELECT 'private.admin_transaction_report_state',count(*) FROM private.admin_transaction_report_state
  UNION ALL SELECT 'private.rank_dues_rate_history',count(*) FROM private.rank_dues_rate_history
) s;
SQL
)

echo "Checking Auth schema compatibility..."
SOURCE_AUTH_SCHEMA="$(db_query "$SOURCE_DB_URL" "$AUTH_SCHEMA_SIGNATURE_SQL")"
TARGET_AUTH_SCHEMA="$(db_query "$TARGET_DB_URL" "$AUTH_SCHEMA_SIGNATURE_SQL")"
if [[ "$SOURCE_AUTH_SCHEMA" != "$TARGET_AUTH_SCHEMA" ]]; then
  echo "Auth schema signatures differ. Refusing to import Auth rows."
  exit 1
fi

echo "Checking source application snapshot..."
SOURCE_APP_SIGNATURE_BEFORE="$(db_query "$SOURCE_DB_URL" "$APP_SIGNATURE_SQL")"
SOURCE_APP_COUNTS_BEFORE="$(db_query "$SOURCE_DB_URL" "$APP_COUNTS_SQL")"

TARGET_APP_TABLES="$(db_query "$TARGET_DB_URL" "SELECT count(*) FROM information_schema.tables WHERE table_schema IN ('public','private') AND table_type='BASE TABLE' AND table_name IN ('member_profiles','dues_settings','member_wallets','wallet_transactions','daily_dues_log','payment_submissions','admin_audit_log','dues_rate_history','app_branding_settings','chat_messages','private_conversations','private_messages','private_chat_hidden','p5_p6_chat_messages','p4_p5_p6_chat_messages','member_rank_rate_history','information_messages','member_leave_requests','treasury_history','admin_bootstrap_tokens','storage_cleanup_state','admin_transaction_report_state','rank_dues_rate_history')")"
TARGET_AUTH_USERS="$(db_query "$TARGET_DB_URL" "SELECT count(*) FROM auth.users")"
TARGET_AUTH_IDENTITIES="$(db_query "$TARGET_DB_URL" "SELECT count(*) FROM auth.identities")"
TARGET_STORAGE_BUCKETS="$(db_query "$TARGET_DB_URL" "SELECT count(*) FROM storage.buckets")"
TARGET_STORAGE_OBJECTS="$(db_query "$TARGET_DB_URL" "SELECT count(*) FROM storage.objects")"

if [[ "$TARGET_APP_TABLES" != "0" || "$TARGET_AUTH_USERS" != "0" || "$TARGET_AUTH_IDENTITIES" != "0" || "$TARGET_STORAGE_BUCKETS" != "0" || "$TARGET_STORAGE_OBJECTS" != "0" ]]; then
  echo "Target is not empty. Checking whether the database restore was already completed..."
  TARGET_APP_SIGNATURE="$(db_query "$TARGET_DB_URL" "$APP_SIGNATURE_SQL")"
  TARGET_AUTH_SIGNATURE="$(db_query "$TARGET_DB_URL" "SELECT md5((SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) FROM auth.users t) || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) FROM auth.identities t))")"
  SOURCE_AUTH_SIGNATURE="$(db_query "$SOURCE_DB_URL" "SELECT md5((SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) FROM auth.users t) || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) FROM auth.identities t))")"
  if [[ "$TARGET_APP_SIGNATURE" == "$SOURCE_APP_SIGNATURE_BEFORE" && "$TARGET_AUTH_SIGNATURE" == "$SOURCE_AUTH_SIGNATURE" ]]; then
    echo "Database rows already match the source snapshot; skipping duplicate restore."
    exit 0
  fi
  echo "Target contains partial or different application data. Refusing to overwrite or truncate it."
  exit 1
fi

echo "Creating private, temporary logical exports..."
mkdir -p "$TMP_DIR/cli-project"
(
  cd "$TMP_DIR/cli-project"
  npx --yes supabase@latest init >/dev/null
  npx --yes supabase@latest db dump --db-url "$SOURCE_DB_URL" -f "$TMP_DIR/roles.sql" --role-only
  npx --yes supabase@latest db dump --db-url "$SOURCE_DB_URL" -f "$TMP_DIR/schema.sql" --schema public,private
  npx --yes supabase@latest db dump --db-url "$SOURCE_DB_URL" -f "$TMP_DIR/data.sql" --use-copy --data-only --schema public,private -x "storage.buckets_vectors" -x "storage.vector_indexes"
)

docker run --rm --network host \
  -e DB_URL="$SOURCE_DB_URL" \
  -v "$TMP_DIR:/backup" postgres:17 \
  sh -ec 'pg_dump --dbname="$DB_URL" --data-only --no-owner --no-privileges --table=auth.users --table=auth.identities --file=/backup/auth-data.sql'

test -s "$TMP_DIR/roles.sql"
test -s "$TMP_DIR/schema.sql"
test -s "$TMP_DIR/data.sql"
test -s "$TMP_DIR/auth-data.sql"
grep -q 'COPY auth.users' "$TMP_DIR/auth-data.sql"
grep -q 'COPY auth.identities' "$TMP_DIR/auth-data.sql"

SOURCE_APP_SIGNATURE_AFTER="$(db_query "$SOURCE_DB_URL" "$APP_SIGNATURE_SQL")"
SOURCE_APP_COUNTS_AFTER="$(db_query "$SOURCE_DB_URL" "$APP_COUNTS_SQL")"
if [[ "$SOURCE_APP_SIGNATURE_BEFORE" != "$SOURCE_APP_SIGNATURE_AFTER" || "$SOURCE_APP_COUNTS_BEFORE" != "$SOURCE_APP_COUNTS_AFTER" ]]; then
  echo "Source data changed during export. No target writes were made; repeat during a quiet/read-only window."
  exit 1
fi

echo "Restoring schema, Auth users/identities, and application data in one transaction..."
docker run --rm --network host \
  -e DB_URL="$TARGET_DB_URL" \
  -v "$TMP_DIR:/backup:ro" \
  -v "$ROOT_DIR/supabase/migration-audit:/restore:ro" \
  postgres:17 sh -ec '
    psql "$DB_URL" -X --single-transaction --variable ON_ERROR_STOP=1 \
      --command "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated" \
      --file /backup/roles.sql \
      --file /backup/schema.sql \
      --command "SET session_replication_role = replica" \
      --file /backup/auth-data.sql \
      --file /backup/data.sql \
      --file /restore/restore-auth-customizations.sql \
      --file /restore/restore-realtime-publication.sql
  '

echo "Verifying restored application rows..."
TARGET_APP_SIGNATURE="$(db_query "$TARGET_DB_URL" "$APP_SIGNATURE_SQL")"
TARGET_APP_COUNTS="$(db_query "$TARGET_DB_URL" "$APP_COUNTS_SQL")"
TARGET_AUTH_SIGNATURE="$(db_query "$TARGET_DB_URL" "SELECT md5((SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) FROM auth.users t) || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) FROM auth.identities t))")"
SOURCE_AUTH_SIGNATURE="$(db_query "$SOURCE_DB_URL" "SELECT md5((SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) FROM auth.users t) || '|' || (SELECT md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) FROM auth.identities t))")"

if [[ "$TARGET_APP_SIGNATURE" != "$SOURCE_APP_SIGNATURE_AFTER" || "$TARGET_AUTH_SIGNATURE" != "$SOURCE_AUTH_SIGNATURE" ]]; then
  echo "Post-restore checksum mismatch. Do not cut over or enable scheduled jobs."
  exit 1
fi

echo "Database restore verified. Application table counts:"
echo "$TARGET_APP_COUNTS"
echo "Auth accounts and identities passed checksum verification."
echo "Temporary SQL exports will now be deleted; no database dump was uploaded or committed."
