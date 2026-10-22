-- Private one-to-one messaging. Hiding a conversation is per-user and never deletes the other participant's history.
create table public.private_conversations (
  id uuid primary key default gen_random_uuid(),
  participant_one_id uuid not null references public.member_profiles(id) on delete cascade,
  participant_two_id uuid not null references public.member_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint private_conversations_distinct_participants check (participant_one_id <> participant_two_id),
  constraint private_conversations_sorted_participants check (participant_one_id < participant_two_id),
  constraint private_conversations_pair_unique unique (participant_one_id, participant_two_id)
);

create index private_conversations_participant_two_idx
  on public.private_conversations (participant_two_id, created_at desc);

create table public.private_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.private_conversations(id) on delete cascade,
  sender_id uuid not null references public.member_profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index private_messages_conversation_created_idx
  on public.private_messages (conversation_id, created_at desc);

create table public.private_chat_hidden (
  user_id uuid not null references public.member_profiles(id) on delete cascade,
  conversation_id uuid not null references public.private_conversations(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create index private_chat_hidden_conversation_idx
  on public.private_chat_hidden (conversation_id);

alter table public.private_conversations enable row level security;
alter table public.private_messages enable row level security;
alter table public.private_chat_hidden enable row level security;

revoke all on table public.private_conversations, public.private_messages, public.private_chat_hidden from public, anon, authenticated;
grant select, insert on table public.private_conversations to authenticated;
grant select, insert on table public.private_messages to authenticated;
grant select, insert, delete on table public.private_chat_hidden to authenticated;

create policy private_conversations_select_participants
  on public.private_conversations for select to authenticated
  using (
    (participant_one_id = (select auth.uid()) or participant_two_id = (select auth.uid()))
    and exists (
      select 1 from public.member_profiles me
      where me.id = (select auth.uid()) and me.status = 'active'
    )
  );

create policy private_conversations_insert_participants
  on public.private_conversations for insert to authenticated
  with check (
    (participant_one_id = (select auth.uid()) or participant_two_id = (select auth.uid()))
    and exists (
      select 1 from public.member_profiles me
      where me.id = (select auth.uid()) and me.status = 'active'
    )
  );

create policy private_messages_select_participants
  on public.private_messages for select to authenticated
  using (
    exists (
      select 1 from public.private_conversations c
      where c.id = conversation_id
        and (c.participant_one_id = (select auth.uid()) or c.participant_two_id = (select auth.uid()))
    )
    and exists (
      select 1 from public.member_profiles me
      where me.id = (select auth.uid()) and me.status = 'active'
    )
  );

create policy private_messages_insert_sender
  on public.private_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.private_conversations c
      where c.id = conversation_id
        and (c.participant_one_id = (select auth.uid()) or c.participant_two_id = (select auth.uid()))
    )
  );

create policy private_chat_hidden_select_own
  on public.private_chat_hidden for select to authenticated
  using (user_id = (select auth.uid()));

create policy private_chat_hidden_insert_own
  on public.private_chat_hidden for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.private_conversations c
      where c.id = conversation_id
        and (c.participant_one_id = (select auth.uid()) or c.participant_two_id = (select auth.uid()))
    )
  );

create policy private_chat_hidden_delete_own
  on public.private_chat_hidden for delete to authenticated
  using (user_id = (select auth.uid()));

-- Validate participant identity and active status using a private, non-exposed trigger function.
create or replace function private.validate_private_conversation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or (auth.uid() <> new.participant_one_id and auth.uid() <> new.participant_two_id) then
    raise exception 'You must be a participant to create this conversation';
  end if;
  if not exists (
    select 1 from public.member_profiles p
    where p.id = new.participant_one_id and p.status = 'active'
  ) or not exists (
    select 1 from public.member_profiles p
    where p.id = new.participant_two_id and p.status = 'active'
  ) then
    raise exception 'Both participants must be active members';
  end if;
  return new;
end;
$$;

create or replace function private.validate_private_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_one uuid;
  v_two uuid;
begin
  if auth.uid() is null or new.sender_id <> auth.uid() then
    raise exception 'Messages must be sent by the signed-in participant';
  end if;
  select c.participant_one_id, c.participant_two_id
    into v_one, v_two
    from public.private_conversations c
    where c.id = new.conversation_id;
  if not found or (auth.uid() <> v_one and auth.uid() <> v_two) then
    raise exception 'You are not a participant in this conversation';
  end if;
  if not exists (
    select 1 from public.member_profiles p
    where p.id = v_one and p.status = 'active'
  ) or not exists (
    select 1 from public.member_profiles p
    where p.id = v_two and p.status = 'active'
  ) then
    raise exception 'Both participants must be active members';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_private_conversation_insert() from public, anon, authenticated;
revoke all on function private.validate_private_message_insert() from public, anon, authenticated;

create trigger private_conversations_validate_insert
  before insert on public.private_conversations
  for each row execute function private.validate_private_conversation_insert();

create trigger private_messages_validate_insert
  before insert on public.private_messages
  for each row execute function private.validate_private_message_insert();

comment on table public.private_conversations is 'One-to-one private conversations; only the two participants can read them.';
comment on table public.private_messages is 'Private messages visible only to conversation participants.';
comment on table public.private_chat_hidden is 'Per-user hidden conversation list; hiding never deletes message history.';
