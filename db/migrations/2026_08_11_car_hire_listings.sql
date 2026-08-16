-- Marketplace Expansion, Stage 3: car-hire vertical. Unlike taxi (a fare
-- per point-to-point leg), car-hire pricing is per vehicle, per day — an
-- operator lists one of their own car_hire vehicles (already registrable
-- via vehicles.service_type, see 2026_08_10_operators_fleet_foundation.sql)
-- at a daily rate, once that vehicle has passed admin verification
-- (vehicles.status = 'active') and their car_hire service_approval is
-- itself approved (same gate the operator-facing endpoint enforces for
-- taxi_fares).
--
-- A separate listings table rather than columns on vehicles, same
-- reasoning as taxi_fares: whether a vehicle is *registered* (compliance,
-- admin-owned) and whether it's *listed for hire at a rate* (commercial,
-- operator-owned) are different concerns that shouldn't share a status
-- column — a vehicle can be verified and still not for hire this week.
--
-- bookings.rental_end_date is new too: every existing service type books a
-- single travel_date, but a car-hire booking spans a date range. Kept
-- nullable and car-hire-only, same "add a column for the concept that
-- needs it" pattern as journey_direction/home_district before it.
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS public.car_hire_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
    daily_rate BIGINT NOT NULL,
    driver_included BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT car_hire_listings_unique_vehicle UNIQUE (vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_car_hire_listings_operator_id ON public.car_hire_listings (operator_id);
CREATE INDEX IF NOT EXISTS idx_car_hire_listings_status ON public.car_hire_listings (status);

DROP TRIGGER IF EXISTS set_car_hire_listings_updated_at ON public.car_hire_listings;
CREATE TRIGGER set_car_hire_listings_updated_at
BEFORE UPDATE ON public.car_hire_listings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.car_hire_listings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS rental_end_date DATE;

-- Verification (run after applying):
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'car_hire_listings';
--   -- expect true.
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'bookings' AND column_name = 'rental_end_date';
--   -- expect one row.
