-- Official information announcements. Posting is enforced by RLS, not just the UI.
create table if not exists public.information_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.information_messages enable row level security;
revoke all on public.information_messages from anon, authenticated;
grant select, insert on public.information_messages to authenticated;

drop policy if exists "Active members can read information" on public.information_messages;
create policy "Active members can read information"
on public.information_messages for select to authenticated
using (
  exists (
    select 1 from public.member_profiles viewer
    where viewer.id = (select auth.uid())
      and viewer.status = 'active'
  )
);

drop policy if exists "Authorized ranks can post information" on public.information_messages;
create policy "Authorized ranks can post information"
on public.information_messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.member_profiles sender
    where sender.id = (select auth.uid())
      and sender.status = 'active'
      and (
        sender.role in ('admin', 'admin_assistant')
        or sender.rank_code in ('P5', 'P6')
      )
  )
);

-- Enable Realtime only if the table is not already in the publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'information_messages'
     ) then
    alter publication supabase_realtime add table public.information_messages;
  end if;
end $$;
