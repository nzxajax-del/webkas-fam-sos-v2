-- Match the already-applied Supabase migration 20261021004747.
-- Keep the internal DDL event trigger but prevent API roles from executing its function.
revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;
grant execute on function public.rls_auto_enable() to postgres;
