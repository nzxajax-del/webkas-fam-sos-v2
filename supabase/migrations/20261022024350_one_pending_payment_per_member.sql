-- A member may have only one payment submission awaiting admin review at a time.
-- Existing pending rows were checked for duplicates before this index was applied.
create unique index if not exists payment_submissions_one_pending_per_member_idx
  on public.payment_submissions (member_id)
  where status = 'pending';
