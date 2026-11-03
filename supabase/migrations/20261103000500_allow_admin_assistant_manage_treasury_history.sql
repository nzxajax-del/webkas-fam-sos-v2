drop policy if exists treasury_history_update_admin_assistant_developer on public.treasury_history;
create policy treasury_history_update_admin_assistant_developer
on public.treasury_history
for update
to authenticated
using (
  exists (
    select 1 from public.member_profiles actor
    where actor.id = (select auth.uid())
      and actor.status = 'active'
      and actor.role in ('admin', 'admin_assistant')
  )
)
with check (
  exists (
    select 1 from public.member_profiles actor
    where actor.id = (select auth.uid())
      and actor.status = 'active'
      and actor.role in ('admin', 'admin_assistant')
  )
);

drop policy if exists treasury_history_delete_admin_assistant_developer on public.treasury_history;
create policy treasury_history_delete_admin_assistant_developer
on public.treasury_history
for delete
to authenticated
using (
  exists (
    select 1 from public.member_profiles actor
    where actor.id = (select auth.uid())
      and actor.status = 'active'
      and actor.role in ('admin', 'admin_assistant')
  )
);

grant update (opening_balance, income, income_note, expense, expense_note)
on public.treasury_history to authenticated;
grant delete on public.treasury_history to authenticated;
