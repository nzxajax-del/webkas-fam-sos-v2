alter table public.treasury_history
  add column if not exists sender_role text not null default 'admin'
  check (sender_role in ('admin','admin_assistant'));

drop policy if exists treasury_history_insert_developer_only on public.treasury_history;
drop policy if exists treasury_history_insert_admin_developer on public.treasury_history;
create policy treasury_history_insert_admin_developer
on public.treasury_history
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.member_profiles actor
    where actor.id = (select auth.uid())
      and actor.status = 'active'
      and actor.role in ('admin','admin_assistant')
      and sender_role = actor.role
  )
);

create index if not exists treasury_history_sender_id_idx on public.treasury_history(sender_id);
create index if not exists treasury_history_created_at_idx on public.treasury_history(created_at desc);
