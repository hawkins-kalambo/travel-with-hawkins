-- Marketplace Expansion, Stage 3: routes.direction only ever allowed
-- 'to_university' | 'from_university' — correct for the district<->campus
-- model it was built for, but a plain public intercity corridor (e.g.
-- Mzuzu -> Lilongwe, no university on either end) doesn't have a "to/from
-- university" direction at all. Stage 1 made university_id nullable and
-- added destination_label for exactly this case, but never widened
-- direction to match, so a non-university route couldn't satisfy the
-- existing CHECK constraint no matter what value it used.
--
-- Adds 'point_to_point' as a third value, and enforces the correspondence
-- at the database level: to_university/from_university require a
-- university_id, point_to_point requires there be none — a route can never
-- claim a university direction it doesn't have, or vice versa.
--
-- Idempotent: safe to run multiple times.

ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_direction_check;
ALTER TABLE public.routes
    ADD CONSTRAINT routes_direction_check
    CHECK (direction IN ('to_university', 'from_university', 'point_to_point'));

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'routes_direction_university_consistency'
    ) THEN
        ALTER TABLE public.routes
            ADD CONSTRAINT routes_direction_university_consistency
            CHECK (
                (direction IN ('to_university', 'from_university') AND university_id IS NOT NULL)
                OR (direction = 'point_to_point' AND university_id IS NULL)
            );
    END IF;
END $$;

COMMENT ON COLUMN public.routes.direction IS
    'to_university: home district -> campus; from_university: campus -> home district; point_to_point: a plain public corridor with no university on either end (see destination_label).';

-- routes_unique_leg (origin_district, university_id, pickup_point_id) is a
-- no-op for point_to_point rows: university_id/pickup_point_id are always
-- NULL there, and Postgres never treats NULL = NULL for uniqueness or
-- ON CONFLICT purposes, so it would silently allow duplicate corridors.
-- destination_label is what actually distinguishes a point_to_point leg, so
-- give those rows their own partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS routes_point_to_point_unique_leg
    ON public.routes (origin_district, destination_label)
    WHERE direction = 'point_to_point';

-- Verification (run after applying):
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.routes'::regclass AND conname LIKE 'routes_direction%';
--   SELECT indexname FROM pg_indexes
--   WHERE tablename = 'routes' AND indexname = 'routes_point_to_point_unique_leg';
