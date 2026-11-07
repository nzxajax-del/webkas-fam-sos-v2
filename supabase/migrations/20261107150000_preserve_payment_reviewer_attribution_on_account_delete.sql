-- Preserve reviewer UUIDs as historical audit attribution when an account is deleted.
-- ON DELETE SET NULL conflicts with payment_review_fields_consistent for reviewed rows,
-- which requires reviewed_by and reviewed_at to remain populated.
ALTER TABLE public.payment_submissions
  DROP CONSTRAINT IF EXISTS payment_submissions_reviewed_by_fkey;

COMMENT ON COLUMN public.payment_submissions.reviewed_by IS
  'Historical auth user UUID of the reviewer. Intentionally not FK-constrained so deleting an account does not erase reviewer attribution or violate payment review consistency.';
