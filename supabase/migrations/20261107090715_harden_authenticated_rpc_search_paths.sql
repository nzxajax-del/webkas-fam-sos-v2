-- Harden authenticated SECURITY DEFINER RPCs against search_path shadowing.
-- All non-catalog objects referenced by these functions are schema-qualified.
ALTER FUNCTION public.admin_database_storage_metrics() SET search_path = pg_catalog;
ALTER FUNCTION public.admin_delete_information_message(uuid) SET search_path = pg_catalog;
ALTER FUNCTION public.admin_delete_member_leave_request(uuid) SET search_path = pg_catalog;
ALTER FUNCTION public.admin_delete_member_without_financial_history(uuid, text) SET search_path = pg_catalog;
ALTER FUNCTION public.admin_get_rank_dues_rates() SET search_path = pg_catalog;
ALTER FUNCTION public.admin_get_transaction_report_cutoff() SET search_path = pg_catalog;
ALTER FUNCTION public.admin_hide_transaction_history() SET search_path = pg_catalog;
ALTER FUNCTION public.admin_schedule_rank_dues_rate(text, numeric) SET search_path = pg_catalog;
ALTER FUNCTION public.get_member_leave_requests() SET search_path = pg_catalog;
ALTER FUNCTION public.get_rank_daily_rate(text) SET search_path = pg_catalog;
ALTER FUNCTION public.set_my_display_name(text) SET search_path = pg_catalog;
