-- Follows 2026_08_04_universities_and_structured_routes.sql. Gives each
-- structured route its own commission fields (same shape as
-- commission_rules: fixed | percentage, BIGINT amount) instead of relying
-- on the string-keyed commission_rules table, which can never match a
-- structured route's destination string (see app/api/bookings/route.ts's
-- resolveCommissionAmount — it matches "Mzuzu - Lilongwe" style outbound
-- names, never the inbound "Lilongwe - Mzuzu University (MZUNI)" strings
-- the district+university search flow produces). Without this, a referred
-- booking made through that flow pays its ambassador nothing.
--
-- Idempotent: safe to run more than once.

ALTER TABLE public.routes
    ADD COLUMN IF NOT EXISTS commission_amount BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS commission_type TEXT NOT NULL DEFAULT 'fixed' CHECK (commission_type IN ('fixed', 'percentage'));

-- Mirrors bookings.route_id — gives commission reporting a real join
-- instead of only the free-text `route` column that already exists on
-- referrals.
ALTER TABLE public.referrals
    ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL;

-- Mzuzu's 5 inbound routes are already active/live today (not a future
-- pilot) — backfilling them with the same fixed amounts already configured
-- for the equivalent outbound routes in commission_rules (see
-- referral_system_migration.sql's seed) means an ambassador's commission
-- doesn't silently drop to zero the moment this ships. Kasungu has no
-- existing commission_rules entry to match, so it's left at the column
-- default (0) for an admin to set explicitly.
UPDATE public.routes r
SET commission_amount = seed.amount
FROM public.universities u, (VALUES
    ('Lilongwe', 2000),
    ('Blantyre', 2500),
    ('Zomba', 2500),
    ('Karonga', 1500)
) AS seed(district, amount)
WHERE r.university_id = u.id
  AND u.short_code = 'MZUNI'
  AND r.origin_district = seed.district
  AND r.commission_amount = 0;

-- Verification (run after applying):
--   SELECT origin_district, fare, commission_amount, commission_type
--   FROM public.routes r JOIN public.universities u ON u.id = r.university_id
--   WHERE u.short_code = 'MZUNI' ORDER BY origin_district;
--   -- expect Blantyre 2500, Karonga 1500, Kasungu 0, Lilongwe 2000, Zomba 2500, all 'fixed'.
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'referrals' AND column_name = 'route_id';
--   -- expect one row.
