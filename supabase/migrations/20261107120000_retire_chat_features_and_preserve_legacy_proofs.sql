-- Retire all WEBKAS chat features after preserving a private rollback copy.
-- Apply only to the restored target project after source/target financial parity checks.
-- Existing legacy payment and registration evidence remains in the source Storage project.

ALTER TABLE public.member_profiles
  ADD COLUMN IF NOT EXISTS registration_proof_source text NOT NULL DEFAULT 'legacy';
ALTER TABLE public.member_profiles
  DROP CONSTRAINT IF EXISTS member_profiles_registration_proof_source_check;
ALTER TABLE public.member_profiles
  ADD CONSTRAINT member_profiles_registration_proof_source_check
  CHECK (registration_proof_source IN ('legacy', 'current'));

CREATE SCHEMA IF NOT EXISTS webkas_chat_rollback_20261107;
CREATE TABLE IF NOT EXISTS webkas_chat_rollback_20261107.chat_messages (LIKE public.chat_messages INCLUDING ALL);
CREATE TABLE IF NOT EXISTS webkas_chat_rollback_20261107.p4_p5_p6_chat_messages (LIKE public.p4_p5_p6_chat_messages INCLUDING ALL);
CREATE TABLE IF NOT EXISTS webkas_chat_rollback_20261107.p5_p6_chat_messages (LIKE public.p5_p6_chat_messages INCLUDING ALL);
CREATE TABLE IF NOT EXISTS webkas_chat_rollback_20261107.private_chat_hidden (LIKE public.private_chat_hidden INCLUDING ALL);
CREATE TABLE IF NOT EXISTS webkas_chat_rollback_20261107.private_conversations (LIKE public.private_conversations INCLUDING ALL);
CREATE TABLE IF NOT EXISTS webkas_chat_rollback_20261107.private_messages (LIKE public.private_messages INCLUDING ALL);

INSERT INTO webkas_chat_rollback_20261107.chat_messages SELECT * FROM public.chat_messages ON CONFLICT DO NOTHING;
INSERT INTO webkas_chat_rollback_20261107.p4_p5_p6_chat_messages SELECT * FROM public.p4_p5_p6_chat_messages ON CONFLICT DO NOTHING;
INSERT INTO webkas_chat_rollback_20261107.p5_p6_chat_messages SELECT * FROM public.p5_p6_chat_messages ON CONFLICT DO NOTHING;
INSERT INTO webkas_chat_rollback_20261107.private_chat_hidden SELECT * FROM public.private_chat_hidden ON CONFLICT DO NOTHING;
INSERT INTO webkas_chat_rollback_20261107.private_conversations SELECT * FROM public.private_conversations ON CONFLICT DO NOTHING;
INSERT INTO webkas_chat_rollback_20261107.private_messages SELECT * FROM public.private_messages ON CONFLICT DO NOTHING;

REVOKE ALL ON SCHEMA webkas_chat_rollback_20261107 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA webkas_chat_rollback_20261107 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.admin_database_storage_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
declare
  v_db_bytes bigint;
  v_public_table_bytes bigint;
  v_storage_bytes bigint;
  v_storage_objects bigint;
  v_cleanup record;
  v_limit constant bigint := 524288000;
begin
  if not exists (
    select 1 from public.member_profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  ) then
    raise exception 'Admin aktif diperlukan';
  end if;
  select pg_database_size(current_database()) into v_db_bytes;
  select coalesce(sum(pg_total_relation_size(format('%I.%I', schemaname, tablename)::regclass)), 0)
    into v_public_table_bytes
    from pg_catalog.pg_tables where schemaname = 'public';
  select count(*), coalesce(sum((o.metadata->>'size')::bigint), 0)
    into v_storage_objects, v_storage_bytes
    from storage.objects o
    where o.bucket_id in ('payment-proofs','registration-proofs');
  select * into v_cleanup from private.storage_cleanup_state where singleton=true;
  return jsonb_build_object(
    'database_bytes', coalesce(v_db_bytes,0),
    'public_tables_bytes', coalesce(v_public_table_bytes,0),
    'chat_messages_count', 0,
    'chat_bytes_estimate', 0,
    'storage_objects_count', coalesce(v_storage_objects,0),
    'storage_bytes', coalesce(v_storage_bytes,0),
    'plan_limit_bytes', v_limit,
    'usage_percent', round((coalesce(v_db_bytes,0)::numeric / v_limit::numeric) * 100, 2),
    'cleanup_threshold_percent', 80,
    'last_auto_cleanup_at', v_cleanup.last_cleanup_at,
    'last_auto_cleanup_size_bytes', v_cleanup.last_size_bytes,
    'last_auto_cleanup_chat_deleted', 0,
    'last_auto_cleanup_payment_deleted', 0,
    'measured_at', now()
  );
end;
$function$;

-- Never auto-delete completed payments or wallet ledger entries to reduce storage usage.
CREATE OR REPLACE FUNCTION private.auto_cleanup_on_database_threshold()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
declare
  v_size bigint;
  v_limit constant bigint := 524288000;
begin
  select pg_database_size(current_database()) into v_size;
  return jsonb_build_object(
    'triggered', false,
    'reason', 'disabled_chat_retirement',
    'database_bytes', v_size,
    'limit_bytes', v_limit,
    'threshold_percent', 80,
    'financial_history_preserved', true,
    'note', 'Automatic deletion of payment submissions and wallet transactions is disabled.'
  );
end;
$function$;

REVOKE ALL PRIVILEGES ON TABLE
  public.chat_messages, public.p4_p5_p6_chat_messages, public.p5_p6_chat_messages,
  public.private_chat_hidden, public.private_conversations, public.private_messages
FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_clear_chat_messages() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_clear_p4_p5_p6_chat_messages() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_clear_p5_p6_chat_messages() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_chat_sender_profiles(uuid[]) FROM PUBLIC, anon, authenticated;

DO $retire$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['chat_messages','p4_p5_p6_chat_messages','p5_p6_chat_messages','private_messages']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I',table_name);
    END IF;
  END LOOP;
END;
$retire$;

DROP TRIGGER IF EXISTS chat_set_sender_metadata ON public.chat_messages;
DROP TRIGGER IF EXISTS private_conversations_validate_insert ON public.private_conversations;
DROP TRIGGER IF EXISTS private_messages_validate_insert ON public.private_messages;

DROP FUNCTION IF EXISTS public.admin_clear_chat_messages();
DROP FUNCTION IF EXISTS public.admin_clear_p4_p5_p6_chat_messages();
DROP FUNCTION IF EXISTS public.admin_clear_p5_p6_chat_messages();
DROP FUNCTION IF EXISTS public.get_chat_sender_profiles(uuid[]);
DROP FUNCTION IF EXISTS private.get_chat_sender_profiles(uuid[]);
DROP FUNCTION IF EXISTS private.chat_cleanup_old_messages();
DROP FUNCTION IF EXISTS private.chat_set_sender_metadata();
DROP FUNCTION IF EXISTS private.validate_private_conversation_insert();
DROP FUNCTION IF EXISTS private.validate_private_message_insert();

DROP TABLE public.private_chat_hidden;
DROP TABLE public.private_messages;
DROP TABLE public.private_conversations;
DROP TABLE public.p4_p5_p6_chat_messages;
DROP TABLE public.p5_p6_chat_messages;
DROP TABLE public.chat_messages;
