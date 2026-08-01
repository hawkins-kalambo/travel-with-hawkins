-- Fix: public.settings is missing the `route_objects` column that a lot of
-- already-shipped application code assumes exists:
--   - app/admin/business-configuration/routes-and-fares/page.tsx reads/writes it
--   - app/api/settings/route.ts (PATCH/PUT) writes it from admin edits
--   - app/api/bookings/route.ts, app/api/payments/confirm/route.ts,
--     app/api/payments/send-receipt/route.ts, lib/routePricing.ts read it
--     to resolve a route's fare
--
-- Because it never existed, every query that named it explicitly in a
-- `.select("routes, route_objects")` call failed OUTRIGHT (PostgREST/Postgres
-- reject the whole query when a requested column doesn't exist — it doesn't
-- just return null for that one field). That silently broke server-side fare
-- resolution on every booking. This was discovered while wiring up the new
-- booking-fee resolution in Phase 2, and is a pre-existing bug, not
-- introduced by this migration.
--
-- Fix: add the column so those queries succeed. Existing rows get an empty
-- array default; the app already knows how to synthesize route_objects from
-- the `routes` text column when the array is empty (see
-- buildDefaultRouteObjects in app/api/settings/route.ts).
--
-- Safe to run multiple times.

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS route_objects JSONB NOT NULL DEFAULT '[]'::jsonb;
