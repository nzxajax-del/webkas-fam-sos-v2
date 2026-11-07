-- WEBKAS application Realtime publication membership.
-- Audit/restore aid only; do not execute until all 11 public tables exist
-- and the target database restore has been verified.
-- This intentionally excludes Supabase-managed realtime.messages partitions.

DO $restore$
DECLARE
  table_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'Expected Supabase publication supabase_realtime is missing';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'admin_audit_log',
    'chat_messages',
    'dues_settings',
    'information_messages',
    'member_profiles',
    'member_wallets',
    'p4_p5_p6_chat_messages',
    'p5_p6_chat_messages',
    'payment_submissions',
    'private_messages',
    'wallet_transactions'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      RAISE EXCEPTION 'Required Realtime table public.% is missing', table_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$restore$;
