-- Marketplace Expansion, Stage 3: replaces the stale placeholder fares on
-- MZUNI's 5 structured district routes (both to_university and
-- from_university legs) with the real, currently live fares confirmed
-- directly against production settings.routes on 2026-08-11 —
-- settings.route_objects was empty, so settings.routes (the free-text blob
-- lib/routePricing.ts parses) is the only real source of truth today:
--   Mzuzu - Blantyre: 120000   Mzuzu - Karonga: 45000
--   Mzuzu - Kasungu:   60000   Mzuzu - Lilongwe: 70000
--   Mzuzu - Zomba:    110000
--
-- lib/routePricing.ts's fare matcher is direction-agnostic (it token-matches
-- "Blantyre - Mzuzu" and "Mzuzu - Blantyre" the same way), so production has
-- always charged this one fare regardless of travel direction — both legs
-- get the same real number here rather than only the outbound one.
--
-- These 5 district+MZUNI routes were seeded 'active' back in
-- 2026_08_04_universities_and_structured_routes.sql / 2026_08_08_directional_
-- routes.sql with placeholder fares (5000/8000/7000/3000/6000) that were
-- never corrected — app/page.tsx's fetchActiveRoutes(district, mzuzu.id,
-- "to_university") already overrides the homepage's popular-route prices
-- with whatever is in this table, so those placeholders have been silently
-- showing on the live homepage in place of the real fare. This migration is
-- the actual fix; commission_amount is untouched (already correct, see
-- 2026_08_04_route_commission_fields.sql).
--
-- Idempotent: a plain UPDATE by (origin_district, university short_code),
-- safe to run more than once.

UPDATE public.routes r
SET fare = seed.fare, updated_at = now()
FROM public.universities u, (VALUES
    ('Blantyre', 120000),
    ('Karonga', 45000),
    ('Kasungu', 60000),
    ('Lilongwe', 70000),
    ('Zomba', 110000)
) AS seed(district, fare)
WHERE r.university_id = u.id
  AND u.short_code = 'MZUNI'
  AND r.origin_district = seed.district
  AND r.direction IN ('to_university', 'from_university');

-- Verification (run after applying):
--   SELECT origin_district, direction, fare, commission_amount, status
--   FROM public.routes r JOIN public.universities u ON u.id = r.university_id
--   WHERE u.short_code = 'MZUNI' ORDER BY origin_district, direction;
--   -- expect Blantyre 120000, Karonga 45000, Kasungu 60000, Lilongwe 70000,
--   -- Zomba 110000 on both to_university and from_university rows (10 total).
