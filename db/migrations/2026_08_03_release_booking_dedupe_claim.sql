-- Companion to db/migrations/2026_08_03_booking_dedupe_claim.sql (already
-- applied). That migration had no way to release a claim once taken —
-- if the booking INSERT failed after claim_booking_dedupe() succeeded, the
-- claim row held the key for the full window with booking_id still NULL,
-- so a legitimate retry got a false "already received, no booking" result,
-- and anyone who knew a target's phone/student ID/destination/date/seat
-- count could pre-claim the key to grief a real booking attempt for up to
-- that long (no data disclosure — the email-match guard on readback still
-- holds; this is availability/annoyance only).
--
-- Idempotent: safe to run multiple times.

CREATE OR REPLACE FUNCTION public.release_booking_dedupe_claim(p_key TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    DELETE FROM public.booking_dedupe_claims WHERE dedupe_key = p_key AND booking_id IS NULL;
$$;

REVOKE ALL ON FUNCTION public.release_booking_dedupe_claim(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_booking_dedupe_claim(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.release_booking_dedupe_claim(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_booking_dedupe_claim(TEXT) TO service_role;

-- Verification (run after applying):
--   SELECT * FROM public.claim_booking_dedupe('test:release', 120);  -- claimed=true
--   SELECT public.release_booking_dedupe_claim('test:release');
--   SELECT * FROM public.claim_booking_dedupe('test:release', 120);  -- claimed=true again (released, not held)
--   DELETE FROM public.booking_dedupe_claims WHERE dedupe_key = 'test:release';  -- clean up test row
