create table if not exists public.treasury_history (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.member_profiles(id) on delete restrict,
  sender_name text not null check (char_length(btrim(sender_name)) between 1 and 80),
  sender_role text not null check (sender_role in ('admin', 'admin_assistant')),
  opening_balance numeric(14,2) not null check (opening_balance >= 0),
  income numeric(14,2) not null default 0 check (income >= 0),
  income_note text not null default '' check (char_length(income_note) <= 500),
  expense numeric(14,2) not null default 0 check (expense >= 0),
  expense_note text not null default '' check (char_length(expense_note) <= 500),
  closing_balance numeric(14,2) generated always as (opening_balance + income - expense) stored,
  created_at timestamptz not null default now()
);

alter table public.treasury_history enable row level security;

revoke all on table public.treasury_history from anon, public;
grant select, insert on table public.treasury_history to authenticated;

drop policy if exists treasury_history_select_active_members on public.treasury_history;
create policy treasury_history_select_active_members
on public.treasury_history
for select
to authenticated
using (
  exists (
    select 1 from public.member_profiles viewer
    where viewer.id = (select auth.uid())
      and viewer.status = 'active'
  )
);

drop policy if exists treasury_history_insert_developer_only on public.treasury_history;
create policy treasury_history_insert_developer_only
on public.treasury_history
for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.member_profiles actor
    where actor.id = (select auth.uid())
      and actor.status = 'active'
      and actor.role in ('admin', 'admin_assistant')
      and sender_role = actor.role
  )
);

create index if not exists treasury_history_sender_id_idx on public.treasury_history(sender_id);
create index if not exists treasury_history_created_at_idx on public.treasury_history(created_at desc);
