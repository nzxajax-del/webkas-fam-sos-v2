drop policy if exists payment_submissions_insert_self_pending on public.payment_submissions;
create policy payment_submissions_insert_self_pending
on public.payment_submissions
for insert to authenticated
with check (
  member_id = (select auth.uid())
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and proof_path like ((select auth.uid())::text || '/%')
  and exists (
    select 1 from public.member_profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and p.role = 'member'
  )
);
