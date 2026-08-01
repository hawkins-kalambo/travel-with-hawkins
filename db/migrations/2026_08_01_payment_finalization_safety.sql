-- Phase 3A: safety preconditions for PayChangu payment finalization.
--
-- Preflight (read-only, run before writing this migration) confirmed:
--   - 36 bookings rows, zero NULL/empty/whitespace-only booking_id, zero
--     duplicate booking_id values.
--   - public.payments and public.payment_events both have zero rows.
-- Both are safe states to add the constraints below with no data
-- remediation required. This migration would not be applied if either
-- check had failed.
--
-- Wrapped in an explicit transaction: if any statement fails, the whole
-- migration rolls back rather than leaving the schema half-changed.
--
-- Safe to run multiple times.

BEGIN;

-- =========================================================================
-- 1. public.bookings.booking_id must be non-null, non-blank, and unique.
-- =========================================================================
-- This is the lookup key the finalization RPC uses to load exactly one
-- booking per payment. Without this, the RPC cannot structurally rule out
-- an "ambiguous booking" match, and a whitespace-only value would satisfy
-- NOT NULL while still being useless as an identifier.

ALTER TABLE public.bookings
  ALTER COLUMN booking_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bookings_booking_id_unique'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_booking_id_unique UNIQUE (booking_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bookings_booking_id_not_blank'
      AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_booking_id_not_blank
      CHECK (length(btrim(booking_id)) > 0);
  END IF;
END $$;

-- =========================================================================
-- 2. payment_events: processing lifecycle for webhook idempotency (Phase 3C
--    will implement the webhook route itself; these columns let it claim,
--    retry and complete events safely without a race between concurrent
--    deliveries or between the webhook and the browser callback).
-- =========================================================================
-- Existing `idempotency_key` (unique) answers "have we seen this event
-- before"; these columns answer "did we finish processing it, and is it
-- safe to retry if not". The two are deliberately separate: seeing an event
-- twice is not the same as having successfully finalized it once.

ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS processing_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_events_processing_status_check'
      AND conrelid = 'public.payment_events'::regclass
  ) THEN
    ALTER TABLE public.payment_events
      ADD CONSTRAINT payment_events_processing_status_check
      CHECK (processing_status IN ('received', 'processing', 'processed', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_events_processing_attempts_check'
      AND conrelid = 'public.payment_events'::regclass
  ) THEN
    ALTER TABLE public.payment_events
      ADD CONSTRAINT payment_events_processing_attempts_check
      CHECK (processing_attempts >= 0);
  END IF;

  -- An event is successfully completed only when BOTH processing_status =
  -- 'processed' AND processed_at IS NOT NULL are true together; every other
  -- status requires processed_at to be NULL. This used to be documented as
  -- an application-layer invariant only — it is now enforced at the
  -- database level, which means Phase 3C's webhook route (and
  -- finalize_payment, which is the only thing that should ever set
  -- processing_status = 'processed') MUST transition processing_status and
  -- processed_at together in the same statement. finalize_payment already
  -- does this (see db/migrations/2026_08_01_finalize_payment_rpc.sql,
  -- the payment_events UPDATE sets both fields in one statement).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_events_processed_consistency_check'
      AND conrelid = 'public.payment_events'::regclass
  ) THEN
    ALTER TABLE public.payment_events
      ADD CONSTRAINT payment_events_processed_consistency_check
      CHECK (
        (processing_status = 'processed' AND processed_at IS NOT NULL)
        OR
        (processing_status <> 'processed' AND processed_at IS NULL)
      );
  END IF;

  -- last_error must stay a short diagnostic code/message, never a raw
  -- provider payload or secret — bounding its length is a cheap guardrail
  -- against that growing into something it shouldn't be.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payment_events_last_error_length_check'
      AND conrelid = 'public.payment_events'::regclass
  ) THEN
    ALTER TABLE public.payment_events
      ADD CONSTRAINT payment_events_last_error_length_check
      CHECK (last_error IS NULL OR length(last_error) <= 500);
  END IF;
END $$;

-- Index for the retry worker: "find events that are received, or failed and
-- eligible for another attempt, or stuck in processing past a timeout".
CREATE INDEX IF NOT EXISTS idx_payment_events_processing_status
  ON public.payment_events (processing_status);

CREATE INDEX IF NOT EXISTS idx_payment_events_processing_started_at
  ON public.payment_events (processing_started_at)
  WHERE processing_status = 'processing';

-- last_error is a short diagnostic string only (e.g. "amount_mismatch",
-- "provider_verify_timeout") — never a raw provider payload or secret.
-- raw_payload itself remains admin-read-only via the RLS policy already in
-- place from Phase 1; this migration does not change payment_events RLS,
-- and no RLS policy or grant on public.bookings is touched either.

COMMENT ON COLUMN public.payment_events.last_error IS
  'Short diagnostic reason only (e.g. amount_mismatch), max 500 characters. Never store secrets, tokens, or full provider payloads here.';

COMMIT;
