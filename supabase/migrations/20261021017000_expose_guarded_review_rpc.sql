-- Public PostgREST wrapper; the privileged implementation remains in the private schema.
create or replace function public.review_payment(
  p_submission_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog
as $$
  select private.review_payment(p_submission_id, p_decision, p_note);
$$;
revoke all on function public.review_payment(uuid,text,text) from public, anon;
grant execute on function public.review_payment(uuid,text,text) to authenticated;
