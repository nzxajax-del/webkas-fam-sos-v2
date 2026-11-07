-- WEBKAS source-project custom Auth trigger.
-- Audit/restore aid only: DO NOT execute until the target schema and data restore plan
-- has been reviewed. This file is not applied to either Supabase project by this commit.
--
-- Source audit found exactly one non-internal trigger in auth:
-- auth.users AFTER INSERT -> public.handle_new_auth_user().
-- The target Auth schema has the same 27 tables, 271 columns, 110 constraints,
-- and 111 indexes, but this custom trigger is absent there.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  requested_name text;
  requested_username text;
BEGIN
  requested_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  IF requested_name IS NULL THEN
    requested_name := 'member-' || left(new.id::text, 8);
  END IF;

  requested_username := lower(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'login_username', '')), ''));
  IF requested_username IS NULL THEN
    requested_username := 'member-' || left(new.id::text, 8);
  END IF;

  IF requested_username !~ '^[a-z0-9._-]{3,30}$' THEN
    RAISE EXCEPTION 'Username must be 3-30 lowercase letters, numbers, dots, underscores or hyphens';
  END IF;

  INSERT INTO public.member_profiles (id, display_name, login_username, role, status)
  VALUES (new.id, requested_name, requested_username, 'member', 'pending');

  -- No automatic ADM debt: administration proof is reviewed manually during registration.
  INSERT INTO public.member_wallets (member_id) VALUES (new.id);

  RETURN new;
END;
$function$;

DO $restore$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_created'
      AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_auth_user();
  END IF;
END;
$restore$;
