-- Phase 0 of the national-expansion plan: introduces a real `universities`
-- entity and a structured, admin-editable `routes` table, replacing the
-- single free-text `settings.route_objects` blob as the source of truth for
-- the district -> university trip-search/booking flow (TripSearchCard,
-- /trips, /book). `settings.route_objects` / `settings.routes` are left
-- completely untouched — they keep powering the older Mzuzu-outbound
-- "Popular routes" pills and custom-destination flow in BookingModal.tsx,
-- via the existing fuzzy matcher in lib/routePricing.ts. Nothing about that
-- path changes.
--
-- Direction note: the existing settings.route_objects rows model OUTBOUND
-- trips (origin "Mzuzu", destination a home district — a student leaving
-- campus). The new `routes` table below models the opposite, INBOUND
-- direction (origin_district -> university), matching what TripSearchCard
-- already asks for on the homepage. That flow currently has no working fare
-- resolution at all (the composed "District - University (CODE)" string
-- never matches an outbound "Mzuzu - District" route in the fuzzy matcher),
-- so this migration's Mzuzu seed data below also closes that gap rather
-- than only adding it for the LUANAR pilot.
--
-- RLS posture: enabled, with zero anon/authenticated policies (deny-by-
-- default), matching the most recent audited convention in this codebase
-- for tables that are only ever touched via server-side API routes using
-- the service-role client (see db/migrations/2026_08_03_enable_rls_bookings_settings_admins.sql).
-- All reads/writes to these three new tables go through
-- app/api/universities/route.ts and app/api/routes/route.ts, both of which
-- use lib/supabaseAdmin.ts. The service role bypasses RLS regardless of
-- policy count, so this can only remove access nothing relies on.
--
-- Idempotent: every statement is safe to run more than once.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.universities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    short_code TEXT NOT NULL UNIQUE,
    town TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.university_pickup_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    university_id UUID NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT university_pickup_points_unique_label UNIQUE (university_id, label)
);

-- `pickup_point_id` is nullable: a university with exactly one active
-- pickup point doesn't require one to be picked explicitly. `fare` is
-- BIGINT (whole MWK) from the start — commission_amount on commission_rules
-- had to be migrated from NUMERIC to BIGINT later for the same reason
-- (see 2026_08_01_commission_lifecycle_and_currency.sql); no reason to
-- repeat that here. New routes default to `status = 'inactive'` — a route
-- (and therefore a university/campus) only becomes bookable once an admin
-- explicitly flips it on, which is the kill-switch the Phase 1 LUANAR plan
-- depends on.
CREATE TABLE IF NOT EXISTS public.routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origin_district TEXT NOT NULL,
    university_id UUID NOT NULL REFERENCES public.universities(id),
    pickup_point_id UUID REFERENCES public.university_pickup_points(id),
    fare BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive')),
    estimated_travel_time TEXT,
    capacity INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT routes_unique_leg UNIQUE (origin_district, university_id, pickup_point_id)
);

CREATE INDEX IF NOT EXISTS idx_university_pickup_points_university_id ON public.university_pickup_points (university_id);
CREATE INDEX IF NOT EXISTS idx_routes_university_id ON public.routes (university_id);
CREATE INDEX IF NOT EXISTS idx_routes_origin_district ON public.routes (origin_district);
CREATE INDEX IF NOT EXISTS idx_routes_status ON public.routes (status);

-- Additive, nullable — existing freeform-destination bookings and
-- applications are entirely unaffected.
ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES public.routes(id),
    ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES public.universities(id);

ALTER TABLE public.ambassador_applications
    ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES public.universities(id);

ALTER TABLE public.ambassadors
    ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES public.universities(id);

CREATE INDEX IF NOT EXISTS idx_bookings_route_id ON public.bookings (route_id);
CREATE INDEX IF NOT EXISTS idx_bookings_university_id ON public.bookings (university_id);
CREATE INDEX IF NOT EXISTS idx_ambassador_applications_university_id ON public.ambassador_applications (university_id);
CREATE INDEX IF NOT EXISTS idx_ambassadors_university_id ON public.ambassadors (university_id);

-- Reuses the set_updated_at() trigger function already defined in
-- referral_system_migration.sql.
DROP TRIGGER IF EXISTS set_universities_updated_at ON public.universities;
CREATE TRIGGER set_universities_updated_at
BEFORE UPDATE ON public.universities
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_university_pickup_points_updated_at ON public.university_pickup_points;
CREATE TRIGGER set_university_pickup_points_updated_at
BEFORE UPDATE ON public.university_pickup_points
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_routes_updated_at ON public.routes;
CREATE TRIGGER set_routes_updated_at
BEFORE UPDATE ON public.routes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.universities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.university_pickup_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

-- Seed the six public universities (names match lib/tripSearchData.ts's
-- MALAWI_PUBLIC_UNIVERSITIES exactly, so query-param round-trips through
-- /book and /trips keep working once those pages read from this table
-- instead of the hardcoded const).
--
-- Status is the actual customer-facing kill switch: TripSearchCard/TripsClient
-- fetch only `status = 'active'` universities, so anything other than Mzuzu
-- stays invisible in customer search until its own launch gate passes,
-- regardless of whether an admin has started configuring its routes.
-- The admin universities page itself lists every row regardless of status,
-- so LUANAR (and the rest) are fully manageable ahead of going live.
INSERT INTO public.universities (name, short_code, town, status) VALUES
    ('Mzuzu University (MZUNI)', 'MZUNI', 'Mzuzu', 'active'),
    ('University of Malawi (UNIMA)', 'UNIMA', 'Zomba', 'inactive'),
    ('Malawi University of Business and Applied Sciences (MUBAS)', 'MUBAS', 'Blantyre', 'inactive'),
    ('Malawi University of Science and Technology (MUST)', 'MUST', 'Thyolo', 'inactive'),
    ('Lilongwe University of Agriculture and Natural Resources (LUANAR)', 'LUANAR', 'Lilongwe', 'inactive'),
    ('Kamuzu University of Health Sciences (KUHeS)', 'KUHES', 'Lilongwe', 'inactive')
ON CONFLICT (name) DO NOTHING;

-- One default pickup point per university so admin has somewhere to attach
-- a route to when they get to it in Phase 2, except LUANAR which gets its
-- real two-site split now (see docs/phase1 plan: Bunda campus + Lilongwe
-- campus have different last-mile logistics and need independent routes).
INSERT INTO public.university_pickup_points (university_id, label, status)
SELECT u.id, 'Main Campus', 'active'
FROM public.universities u
WHERE u.short_code IN ('MZUNI', 'UNIMA', 'MUBAS', 'MUST', 'KUHES')
ON CONFLICT (university_id, label) DO NOTHING;

INSERT INTO public.university_pickup_points (university_id, label, status)
SELECT u.id, label, 'active'
FROM public.universities u, (VALUES ('Bunda Campus'), ('Lilongwe Campus')) AS site(label)
WHERE u.short_code = 'LUANAR'
ON CONFLICT (university_id, label) DO NOTHING;

-- Mzuzu: real, active, inbound (district -> campus) routes at the same
-- fares as the existing outbound settings.route_objects defaults — this is
-- what the district+university trip search on the homepage has been
-- missing a working fare for. Placed against Mzuzu's single pickup point.
INSERT INTO public.routes (origin_district, university_id, pickup_point_id, fare, status)
SELECT district, u.id, pp.id, fare, 'active'
FROM public.universities u
JOIN public.university_pickup_points pp ON pp.university_id = u.id AND pp.label = 'Main Campus'
JOIN (VALUES
    ('Lilongwe', 5000),
    ('Blantyre', 8000),
    ('Zomba', 7000),
    ('Kasungu', 3000),
    ('Karonga', 6000)
) AS seed(district, fare) ON true
WHERE u.short_code = 'MZUNI'
ON CONFLICT (origin_district, university_id, pickup_point_id) DO NOTHING;

-- LUANAR pilot: draft routes only, both legs inactive with placeholder
-- fares. An admin fills in real numbers and flips status once transport-
-- partner terms close (Phase 1 launch gate) — see the Phase 1 execution
-- plan for the full checklist.
INSERT INTO public.routes (origin_district, university_id, pickup_point_id, fare, status)
SELECT 'Lilongwe', u.id, pp.id, 0, 'inactive'
FROM public.universities u
JOIN public.university_pickup_points pp ON pp.university_id = u.id
WHERE u.short_code = 'LUANAR' AND pp.label IN ('Bunda Campus', 'Lilongwe Campus')
ON CONFLICT (origin_district, university_id, pickup_point_id) DO NOTHING;

-- Best-effort backfill of the new nullable FK columns against existing
-- data. Ambassador rows/applications default their free-text `university`
-- column to 'Mzuzu University' (not the full 'Mzuzu University (MZUNI)'
-- name seeded above), so this matches by prefix rather than exact string.
UPDATE public.ambassadors
SET university_id = (SELECT id FROM public.universities WHERE short_code = 'MZUNI')
WHERE university_id IS NULL AND university ILIKE 'Mzuzu%';

UPDATE public.ambassador_applications
SET university_id = (SELECT id FROM public.universities WHERE short_code = 'MZUNI')
WHERE university_id IS NULL AND university ILIKE 'Mzuzu%';

-- Every historical booking's pickup has been hardcoded to "Mzuzu University"
-- (see lib/bookingUtils.ts's toSupabaseBookingPayload) — this has been a
-- single-campus system to date, so backfilling university_id for all of
-- them is safe and immediately useful for admin reporting. route_id is left
-- NULL (no reliable way to map old freeform `destination` text back to a
-- specific new route row) — the fuzzy fare matcher remains the fallback for
-- these rows, unchanged.
UPDATE public.bookings
SET university_id = (SELECT id FROM public.universities WHERE short_code = 'MZUNI')
WHERE university_id IS NULL;

-- Verification (run after applying):
--   SELECT short_code, status FROM public.universities ORDER BY short_code;
--   -- expect 6 rows: MZUNI 'active', the other five 'inactive'.
--   SELECT u.short_code, r.origin_district, r.fare, r.status
--   FROM public.routes r JOIN public.universities u ON u.id = r.university_id
--   ORDER BY u.short_code, r.origin_district;
--   -- expect 5 active MZUNI rows and 2 inactive LUANAR rows (fare 0).
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('universities', 'university_pickup_points', 'routes');
--   -- relrowsecurity should be true for all three.
