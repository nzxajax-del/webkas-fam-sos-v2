-- Separate legacy payment evidence from uploads made after the database cutover.
-- Existing submissions are marked legacy so their proof_path continues to refer
-- to the original Supabase Storage project. New submissions explicitly use current.
ALTER TABLE public.payment_submissions
  ADD COLUMN IF NOT EXISTS proof_storage_source text NOT NULL DEFAULT 'legacy';

ALTER TABLE public.payment_submissions
  DROP CONSTRAINT IF EXISTS payment_submissions_proof_storage_source_check;

ALTER TABLE public.payment_submissions
  ADD CONSTRAINT payment_submissions_proof_storage_source_check
  CHECK (proof_storage_source IN ('legacy', 'current'));

COMMENT ON COLUMN public.payment_submissions.proof_storage_source IS
  'legacy = object remains in the original Supabase Storage project; current = object stored in this project payment-proofs bucket.';
