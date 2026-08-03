-- Closes a race condition in POST /api/bookings' duplicate-submission
-- guard (app/api/bookings/route.ts). The guard was a plain "SELECT ... then
-- INSERT if nothing found" against a 2-minute window on
-- phone+student_id+destination+travel_date+seats — two near-simultaneous
-- submits (double-click, a retried request) could both pass the SELECT
-- before either INSERT landed, producing two bookings and two pending
-- referral/commission rows for one real trip.
--
-- A plain permanent UNIQUE constraint on those columns would be too strict
-- (it would block a genuine rebooking of the same trip after a
-- cancellation, days or weeks later) so instead this follows the same
-- pattern as rate_limit_hit() / finalize_payment(): a single atomic
-- Postgres function taking an advisory lock on the natural key for the
-- duration of the transaction, so two concurrent callers with the same key
-- are serialized rather than racing.
--
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.booking_dedupe_claims (
    dedupe_key TEXT PRIMARY KEY,
    booking_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_dedupe_claims ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: only the service role (via the
-- functions below, or the service-role Supabase client directly) may
-- touch this table.

-- Call once, before creating the booking row. Returns claimed = true if
-- this caller is the first within the window (proceed to create the
-- booking); claimed = false with existing_booking_id set if a prior
-- submission already exists and finished; claimed = false with
-- existing_booking_id null if a prior submission is still in flight
-- (finish_booking_dedupe_claim hasn't been called for it yet).
CREATE OR REPLACE FUNCTION public.claim_booking_dedupe(p_key TEXT, p_window_seconds INTEGER)
RETURNS TABLE(claimed BOOLEAN, existing_booking_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing RECORD;
BEGIN
    -- Held for the rest of this transaction — a concurrent call with the
    -- same key blocks here until this one commits, so only one caller can
    -- ever observe "nothing claimed yet" for a given key at a time.
    PERFORM pg_advisory_xact_lock(hashtext(p_key));

    SELECT c.booking_id, c.created_at INTO v_existing
    FROM public.booking_dedupe_claims c
    WHERE c.dedupe_key = p_key AND c.created_at > now() - make_interval(secs => p_window_seconds)
    ORDER BY c.created_at DESC
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT false, v_existing.booking_id;
        RETURN;
    END IF;

    INSERT INTO public.booking_dedupe_claims AS c (dedupe_key, booking_id, created_at)
    VALUES (p_key, NULL, now())
    ON CONFLICT (dedupe_key) DO UPDATE SET booking_id = NULL, created_at = now();

    RETURN QUERY SELECT true, NULL::TEXT;
END;
$$;

-- Call once the real booking row has been created, so the next submission
-- within the window gets back a real booking_id instead of NULL.
CREATE OR REPLACE FUNCTION public.finish_booking_dedupe_claim(p_key TEXT, p_booking_id TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    UPDATE public.booking_dedupe_claims SET booking_id = p_booking_id WHERE dedupe_key = p_key;
$$;

REVOKE ALL ON FUNCTION public.claim_booking_dedupe(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_booking_dedupe(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_booking_dedupe(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_booking_dedupe(TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.finish_booking_dedupe_claim(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_booking_dedupe_claim(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.finish_booking_dedupe_claim(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finish_booking_dedupe_claim(TEXT, TEXT) TO service_role;

-- Old claims accumulate forever otherwise. A cheap periodic cleanup
-- helper — call from a scheduled job/cron if one is ever added; harmless
-- if never called.
CREATE OR REPLACE FUNCTION public.cleanup_expired_booking_dedupe_claims()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    DELETE FROM public.booking_dedupe_claims WHERE created_at < now() - INTERVAL '1 hour';
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_booking_dedupe_claims() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_booking_dedupe_claims() TO service_role;

-- Verification (run after applying):
--   SELECT * FROM public.claim_booking_dedupe('test:key', 120);  -- claimed=true,  existing_booking_id=null
--   SELECT * FROM public.claim_booking_dedupe('test:key', 120);  -- claimed=false, existing_booking_id=null (still in flight)
--   SELECT public.finish_booking_dedupe_claim('test:key', 'BK-TEST-1');
--   SELECT * FROM public.claim_booking_dedupe('test:key', 120);  -- claimed=false, existing_booking_id='BK-TEST-1'
--   DELETE FROM public.booking_dedupe_claims WHERE dedupe_key = 'test:key';  -- clean up test row
