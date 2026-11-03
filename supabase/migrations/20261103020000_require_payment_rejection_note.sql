-- Require a member-visible explanation whenever a payment submission is rejected.
-- Existing historical rows are left unchanged; this only guards future status changes.
create or replace function public.require_payment_rejection_note()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.status = 'rejected'
     and old.status is distinct from new.status
     and nullif(btrim(coalesce(new.review_note, '')), '') is null then
    raise exception 'Keterangan penolakan wajib diisi.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists payment_rejection_note_required on public.payment_submissions;
create trigger payment_rejection_note_required
before update of status, review_note on public.payment_submissions
for each row
execute function public.require_payment_rejection_note();
