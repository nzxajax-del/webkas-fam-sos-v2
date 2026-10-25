-- Allow active Super Admins to remove any information post.
-- Admin Assistants and P5/P6 can remove only their own posts.
drop policy if exists "Authorized users can delete information" on public.information_messages;

create policy "Authorized users can delete information"
on public.information_messages
for delete
to authenticated
using (
  exists (
    select 1
    from public.member_profiles actor
    where actor.id = (select auth.uid())
      and actor.status = 'active'
      and (
        actor.role = 'admin'
        or (
          information_messages.sender_id = (select auth.uid())
          and (
            actor.role = 'admin_assistant'
            or actor.rank_code in ('P5', 'P6')
          )
        )
      )
  )
);
