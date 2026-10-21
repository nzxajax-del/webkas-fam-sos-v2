create policy dues_rate_history_admin_select
on public.dues_rate_history
for select to authenticated
using (private.is_admin());
