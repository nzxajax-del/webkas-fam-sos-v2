-- Publish private message inserts so clients can update unread-message notifications in realtime.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'private_messages'
  ) then
    alter publication supabase_realtime add table public.private_messages;
  end if;
end;
$$;
