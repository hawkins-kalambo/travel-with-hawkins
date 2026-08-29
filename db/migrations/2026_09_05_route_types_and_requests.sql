-- Routes: student vs general travel, popular flag, and a route-request inbox.
-- Master plan: "Improved Routes, Student Travel and General Travel Flow" (Slice 1).
--
-- STATUS: NOT APPLIED. Additive / widening only. Review and exercise against
-- isolated staging. Depends on:
--   2026_08_04_universities_and_structured_routes.sql  (routes, universities)
--   2026_08_08_directional_routes.sql                  (routes.direction, bookings.journey_*)
--
-- What it does:
--   1. routes.route_type  - 'student' (home district <-> a university),
--      'general' (district <-> district, no university), or 'both'.
--      university_id becomes NULLABLE so a general route needs none.
--      destination_district holds the far end of a general route (a student
--      route's destination is still the university name).
--      routes.direction CHECK gains 'general'.
--   2. routes.is_popular / popular_order  - the admin-curated "Popular Routes"
--      list, replacing the legacy settings.route_objects blob for the
--      structured flow.
--   3. bookings.traveller_type  - 'student' | 'general', backfilled from
--      whether the booking has a university.
--   4. route_requests  - a customer asked for a corridor we don't run yet;
--      an admin reviews and either adds the route or declines. Never blocks
--      the conversation.

BEGIN;

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS route_type TEXT NOT NULL DEFAULT 'student'
    CHECK (route_type IN ('student', 'general', 'both')),
  ADD COLUMN IF NOT EXISTS destination_district TEXT,
  ADD COLUMN IF NOT EXISTS is_popular BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS popular_order INTEGER;

ALTER TABLE public.routes ALTER COLUMN university_id DROP NOT NULL;

ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_direction_check;
ALTER TABLE public.routes
  ADD CONSTRAINT routes_direction_check
  CHECK (direction IN ('to_university', 'from_university', 'general'));

-- A student route must name a university; a general route must not, and needs
-- an explicit destination district instead.
ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_type_shape_check;
ALTER TABLE public.routes
  ADD CONSTRAINT routes_type_shape_check CHECK (
    (route_type = 'general'
       AND university_id IS NULL
       AND destination_district IS NOT NULL
       AND direction = 'general')
    OR
    (route_type <> 'general'
       AND university_id IS NOT NULL
       AND direction IN ('to_university', 'from_university'))
  );

-- routes_unique_leg only covers the university columns, so two general routes
-- on the same corridor would both insert (NULLs are distinct). Guard them
-- with their own partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_general_leg
  ON public.routes (origin_district, destination_district)
  WHERE direction = 'general';

CREATE INDEX IF NOT EXISTS idx_routes_popular
  ON public.routes (popular_order)
  WHERE is_popular AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_routes_type ON public.routes (route_type, status);

-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS traveller_type TEXT
    CHECK (traveller_type IS NULL OR traveller_type IN ('student', 'general'));

UPDATE public.bookings
   SET traveller_type = 'student'
 WHERE traveller_type IS NULL AND university_id IS NOT NULL;

-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.route_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('whatsapp', 'web', 'admin')),
  origin TEXT NOT NULL CHECK (length(btrim(origin)) BETWEEN 1 AND 120),
  destination TEXT NOT NULL CHECK (length(btrim(destination)) BETWEEN 1 AND 120),
  traveller_type TEXT CHECK (traveller_type IS NULL OR traveller_type IN ('student', 'general')),
  travel_date DATE,
  requested_by_name TEXT,
  requested_by_phone TEXT,
  whatsapp_contact_id UUID REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewing', 'added', 'declined')),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_requests_status ON public.route_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_requests_corridor
  ON public.route_requests (lower(origin), lower(destination));

DROP TRIGGER IF EXISTS set_route_requests_updated_at ON public.route_requests;
CREATE TRIGGER set_route_requests_updated_at
BEFORE UPDATE ON public.route_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.route_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.route_requests FROM PUBLIC, anon, authenticated;

COMMIT;

-- Staging verification:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.routes'::regclass AND contype = 'c';
--   SELECT column_name, is_nullable FROM information_schema.columns
--    WHERE table_name = 'routes'
--      AND column_name IN ('route_type','destination_district','is_popular','popular_order','university_id');
--   SELECT count(*) FROM public.bookings WHERE traveller_type = 'student';
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'route_requests';
