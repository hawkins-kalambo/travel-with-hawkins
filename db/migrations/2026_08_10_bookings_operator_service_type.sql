-- Marketplace Expansion, Stage 3: makes the universal booking model
-- (Master Plan §3.3) real on public.bookings itself. Stage 1
-- (2026_08_10_operators_fleet_foundation.sql) added operator_id to routes
-- but never propagated it to bookings — this closes that gap.
--
-- Deliberately does NOT add a "channel" column: a separate, unrelated
-- migration in this tree already adds bookings.booking_source ('web' |
-- 'whatsapp') covering the same concept Master Plan §3.3 calls "channel".
-- Adding a second column for the same idea would fork it. If that work
-- hasn't landed in your database yet, this migration doesn't depend on it
-- either way — booking_source stays whatever that other migration defines
-- when it runs, in whatever order the two are applied.
--
-- Nothing customer-facing changes by itself. Every existing booking is
-- backfilled to the internal "Travel With Hawkins" operator and
-- service_type 'intercity' — application code is updated separately to
-- start stamping operator_id on new bookings going forward.
--
-- Idempotent: safe to run multiple times.

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES public.operators(id),
    ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'intercity';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'bookings_service_type_check'
    ) THEN
        ALTER TABLE public.bookings
            ADD CONSTRAINT bookings_service_type_check
            CHECK (service_type IN ('intercity', 'taxi', 'car_hire'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bookings_operator_id ON public.bookings (operator_id);
CREATE INDEX IF NOT EXISTS idx_bookings_service_type ON public.bookings (service_type);

UPDATE public.bookings
SET operator_id = (SELECT id FROM public.operators WHERE display_name = 'Travel With Hawkins')
WHERE operator_id IS NULL;

-- Verification (run after applying):
--   SELECT count(*) FROM public.bookings WHERE operator_id IS NULL;
--   -- expect 0.
--   SELECT service_type, count(*) FROM public.bookings GROUP BY service_type;
--   -- expect a single 'intercity' row covering every existing booking.
