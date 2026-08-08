-- Makes every configured university route explicitly one-way. Existing
-- structured routes were district -> university, so they retain that meaning.
-- The reverse leg is a separate row because fare, capacity and availability
-- can differ when students are travelling home.

ALTER TABLE public.routes
    ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'to_university';

ALTER TABLE public.routes
    DROP CONSTRAINT IF EXISTS routes_direction_check;

ALTER TABLE public.routes
    ADD CONSTRAINT routes_direction_check
    CHECK (direction IN ('to_university', 'from_university'));

ALTER TABLE public.routes
    DROP CONSTRAINT IF EXISTS routes_unique_leg;

ALTER TABLE public.routes
    ADD CONSTRAINT routes_unique_leg
    UNIQUE (origin_district, university_id, pickup_point_id, direction);

CREATE INDEX IF NOT EXISTS idx_routes_direction ON public.routes (direction);

-- Launch the reverse journey for every existing active/configured corridor.
-- Admins can immediately give the reverse leg a different fare, capacity,
-- commission or status without changing its district -> university twin.
INSERT INTO public.routes (
    origin_district,
    university_id,
    pickup_point_id,
    direction,
    fare,
    status,
    estimated_travel_time,
    capacity,
    commission_amount,
    commission_type
)
SELECT
    origin_district,
    university_id,
    pickup_point_id,
    'from_university',
    fare,
    status,
    estimated_travel_time,
    capacity,
    commission_amount,
    commission_type
FROM public.routes
WHERE direction = 'to_university'
  AND NOT EXISTS (
      SELECT 1
      FROM public.routes reverse_route
      WHERE reverse_route.origin_district = routes.origin_district
        AND reverse_route.university_id = routes.university_id
        AND reverse_route.pickup_point_id IS NOT DISTINCT FROM routes.pickup_point_id
        AND reverse_route.direction = 'from_university'
  );

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS journey_direction TEXT,
    ADD COLUMN IF NOT EXISTS home_district TEXT,
    ADD COLUMN IF NOT EXISTS journey_origin TEXT,
    ADD COLUMN IF NOT EXISTS journey_destination TEXT;

ALTER TABLE public.bookings
    DROP CONSTRAINT IF EXISTS bookings_journey_direction_check;

ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_journey_direction_check
    CHECK (journey_direction IS NULL OR journey_direction IN ('to_university', 'from_university'));

CREATE INDEX IF NOT EXISTS idx_bookings_journey_direction ON public.bookings (journey_direction);
CREATE INDEX IF NOT EXISTS idx_bookings_home_district ON public.bookings (home_district);

COMMENT ON COLUMN public.routes.origin_district IS
    'The student home district. Physical origin is determined by direction.';
COMMENT ON COLUMN public.routes.direction IS
    'to_university: home district -> campus; from_university: campus -> home district.';
