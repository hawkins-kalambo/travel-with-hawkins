-- Separates home-district pickup/drop-off points from university campus
-- points. A route now pairs one district point with one campus point.

CREATE TABLE IF NOT EXISTS public.district_pickup_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
    district TEXT NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT district_pickup_points_unique_label UNIQUE (university_id, district, label)
);

CREATE INDEX IF NOT EXISTS idx_district_pickup_points_university
    ON public.district_pickup_points (university_id);
CREATE INDEX IF NOT EXISTS idx_district_pickup_points_district
    ON public.district_pickup_points (district);
CREATE INDEX IF NOT EXISTS idx_district_pickup_points_status
    ON public.district_pickup_points (status);

DROP TRIGGER IF EXISTS set_district_pickup_points_updated_at ON public.district_pickup_points;
CREATE TRIGGER set_district_pickup_points_updated_at
BEFORE UPDATE ON public.district_pickup_points
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.district_pickup_points ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.routes
    ADD COLUMN IF NOT EXISTS district_pickup_point_id UUID
        REFERENCES public.district_pickup_points(id) ON DELETE RESTRICT;

-- Preserve every existing route by making its former district-wide pickup
-- explicit. Admins can rename these placeholders to real landmarks or add
-- additional points before launching a corridor.
INSERT INTO public.district_pickup_points (university_id, district, label, status)
SELECT DISTINCT university_id, origin_district, origin_district || ' Main Pickup Point', 'active'
FROM public.routes
ON CONFLICT (university_id, district, label) DO NOTHING;

UPDATE public.routes AS route
SET district_pickup_point_id = point.id
FROM public.district_pickup_points AS point
WHERE route.district_pickup_point_id IS NULL
  AND point.university_id = route.university_id
  AND point.district = route.origin_district
  AND point.label = route.origin_district || ' Main Pickup Point';

ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_unique_leg;
ALTER TABLE public.routes
    ADD CONSTRAINT routes_unique_leg UNIQUE (
        origin_district,
        university_id,
        pickup_point_id,
        district_pickup_point_id,
        direction
    );

CREATE INDEX IF NOT EXISTS idx_routes_district_pickup_point
    ON public.routes (district_pickup_point_id);

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS district_pickup_point_id UUID
        REFERENCES public.district_pickup_points(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS university_pickup_point_id UUID
        REFERENCES public.university_pickup_points(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_district_pickup_point
    ON public.bookings (district_pickup_point_id);
CREATE INDEX IF NOT EXISTS idx_bookings_university_pickup_point
    ON public.bookings (university_pickup_point_id);

UPDATE public.bookings AS booking
SET district_pickup_point_id = route.district_pickup_point_id,
    university_pickup_point_id = route.pickup_point_id
FROM public.routes AS route
WHERE booking.route_id = route.id
  AND (booking.district_pickup_point_id IS NULL OR booking.university_pickup_point_id IS NULL);

ALTER TABLE public.university_admin_assignments
    ADD COLUMN IF NOT EXISTS can_manage_routes BOOLEAN NOT NULL DEFAULT true;

-- Verification:
-- SELECT u.short_code, p.district, p.label, p.status
-- FROM public.district_pickup_points p JOIN public.universities u ON u.id = p.university_id
-- ORDER BY u.short_code, p.district, p.label;
-- SELECT count(*) AS routes_missing_district_point FROM public.routes WHERE district_pickup_point_id IS NULL;
