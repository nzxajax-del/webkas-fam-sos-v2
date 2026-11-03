-- Keep the payment queue and payment-proof access aligned with the
-- Admin Assistant P1-P4 review boundary. Developer retains full access.

create or replace function private.is_developer()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.member_profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.status = 'active'
  );
$$;
revoke all on function private.is_developer() from public, anon;
grant execute on function private.is_developer() to authenticated;

-- Remove legacy broad assistant and shared-admin SELECT policies.
drop policy if exists payment_submissions_select_admin_assistant on public.payment_submissions;
drop policy if exists payment_submissions_select_self_or_admin on public.payment_submissions;
create policy payment_submissions_select_self_or_developer
  on public.payment_submissions
  for select to authenticated
  using (
    member_id = (select auth.uid())
    or (select private.is_developer())
  );
-- The separate payment_submissions_assistant_payment_read policy limits
-- assistants to active P1-P4 member submissions.

-- Keep proof access private: members see their own proof, Developer sees all,
-- and Admin Assistant sees only P1-P4 proofs through the dedicated policy.
drop policy if exists payment_proofs_read_own_or_admin on storage.objects;
create policy payment_proofs_read_own_or_developer
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_developer())
    )
  );

-- Proof deletion is handled server-side by review-payment using service_role.
-- Restrict direct Storage deletion to Developer to avoid widening assistant access.
drop policy if exists payment_proofs_delete_admin on storage.objects;
create policy payment_proofs_delete_developer
  on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (select private.is_developer())
  );
