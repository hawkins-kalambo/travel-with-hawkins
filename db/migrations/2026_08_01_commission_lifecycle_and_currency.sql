-- Fixes AMB-002 and AMB-018 from docs/ambassador-system-audit.md.
--
-- AMB-002: nothing in the codebase ever reversed a commission when its
-- booking was cancelled or refunded. The application code (see
-- app/api/bookings/route.ts PATCH handler, updated alongside this
-- migration) now does that, but needs somewhere to record why/when a
-- commission was reversed, distinct from a normal admin-driven status
-- change.
--
-- AMB-018: `payments`/`wallet_transactions` store money as BIGINT (whole
-- MWK; lib/payments/verification-validator.ts already rejects any
-- non-integer amount), while `referrals`/`bookings`/`commission_rules`
-- store commission amounts as NUMERIC(12,2). Two precision models for the
-- same currency in the same system. Standardizes on BIGINT everywhere,
-- rounding any pre-existing fractional values (application code already
-- only ever produces whole-MWK values via Math.round(), so this should be
-- a no-op for real data — the rounding step is a safety net, not an
-- expected data change).
--
-- Idempotent for the column-add steps; the type-change steps use
-- ALTER COLUMN ... TYPE, which is safe to re-run (a BIGINT column changing
-- type to BIGINT is a no-op) but is the one part of this migration that
-- touches existing values, so it's called out explicitly for review.

ALTER TABLE public.referrals
    ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
    ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

-- --- Currency standardization (review before running) -----------------
-- Round any existing fractional commission values to the nearest whole MWK
-- before narrowing the column type, so the type change itself never
-- truncates/loses data unexpectedly.
UPDATE public.referrals SET commission_amount = ROUND(commission_amount) WHERE commission_amount != ROUND(commission_amount);
UPDATE public.commission_rules SET commission_amount = ROUND(commission_amount) WHERE commission_amount != ROUND(commission_amount);

DO $$
BEGIN
  IF to_regclass('public.bookings') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'commission_amount'
     ) THEN
    UPDATE public.bookings SET commission_amount = ROUND(commission_amount) WHERE commission_amount IS NOT NULL AND commission_amount != ROUND(commission_amount);
    ALTER TABLE public.bookings ALTER COLUMN commission_amount TYPE BIGINT USING ROUND(commission_amount)::BIGINT;
  END IF;
END;
$$;

ALTER TABLE public.referrals ALTER COLUMN commission_amount TYPE BIGINT USING ROUND(commission_amount)::BIGINT;
ALTER TABLE public.commission_rules ALTER COLUMN commission_amount TYPE BIGINT USING ROUND(commission_amount)::BIGINT;

-- Verification (run after applying):
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name IN ('referrals', 'bookings', 'commission_rules') AND column_name = 'commission_amount';
--   -- expect: bigint for all three
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'referrals' AND column_name IN ('cancelled_reason', 'reversed_at');
