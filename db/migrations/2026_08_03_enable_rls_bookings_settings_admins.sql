-- `bookings`, `settings`, and `admins` hold the most sensitive data in the
-- system (customer PII + payment status, business configuration, and the
-- admin roster itself) but were never CREATE TABLE'd in any migration in
-- this repo — they predate the migrations folder. Their Row Level Security
-- state in production was therefore undocumented and unverifiable from
-- source, resting on a comment elsewhere claiming a one-off manual probe
-- once confirmed anon access was rejected. That's not something future
-- changes can be checked against.
--
-- All application access to these three tables goes through
-- lib/supabaseAdmin.ts (the service-role client) in server-side API routes
-- — grep confirms no client/browser code queries them directly with the
-- anon key. The service role always bypasses RLS regardless of policy
-- count, so enabling RLS here with no anon/authenticated policies can only
-- remove access nothing in this codebase was relying on; it does not
-- change how the app itself behaves.
--
-- Idempotent: safe to run multiple times. Uses a DO block because, unlike
-- CREATE TABLE, there's no "ENABLE ROW LEVEL SECURITY IF NOT ALREADY
-- ENABLED" shorthand — ALTER TABLE ... ENABLE ROW LEVEL SECURITY is itself
-- already idempotent (re-running it when already enabled is a no-op, not
-- an error), so a plain statement is fine.

ALTER TABLE IF EXISTS public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admins ENABLE ROW LEVEL SECURITY;

-- No policies added for anon/authenticated on any of the three — deny by
-- default, same posture as public.rate_limit_buckets and
-- public.booking_dedupe_claims elsewhere in this migrations folder. If a
-- legitimate direct (non-service-role) read/write need ever comes up for
-- one of these tables, add a narrowly-scoped policy for it explicitly
-- rather than disabling RLS again.

-- Verification (run after applying):
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('bookings', 'settings', 'admins');
--   -- relrowsecurity should be true for all three.
