-- Marketplace Expansion, Stage 3: migrates the real, live Mzuzu-outbound
-- corridors out of settings.routes (the free-text blob lib/routePricing.ts
-- parses) into the structured routes table, as point_to_point rows (see
-- 2026_08_11_routes_point_to_point_direction.sql).
--
-- Fares confirmed directly against production on 2026-08-11:
--   Mzuzu - Blantyre: 120000
--   Mzuzu - Karonga:   45000
--   Mzuzu - Kasungu:   60000
--   Mzuzu - Lilongwe:  70000
--   Mzuzu - Zomba:    110000
-- (settings.route_objects was empty — settings.routes is the only source
-- of truth in production today.) Commission amounts carried over from the
-- existing commission_rules seed (referral_system_migration.sql) for the
-- four corridors that have one; Kasungu has none there either and is left
-- at the column default (0) for an admin to set, same as the university
-- structured routes did for it in 2026_08_04_route_commission_fields.sql.
--
-- These rows are created active with their real, confirmed fares — nothing
-- customer-facing reads from them yet (the homepage's "Popular routes"
-- pills still read settings.route_objects/routes until a following change
-- switches that over), so this is safe to apply well ahead of that cutover.
--
-- Idempotent: ON CONFLICT targets routes_point_to_point_unique_leg, the
-- partial unique index on (origin_district, destination_label) WHERE
-- direction = 'point_to_point' added in
-- 2026_08_11_routes_point_to_point_direction.sql (which must run first) —
-- the table's other unique constraint, routes_unique_leg, can't do this
-- job because university_id/pickup_point_id are NULL on every row here and
-- Postgres never matches NULL = NULL for conflict detection.

INSERT INTO public.routes (
    origin_district, destination_label, university_id, pickup_point_id, direction,
    fare, status, operator_id, commission_amount, commission_type
)
SELECT
    'Mzuzu', seed.destination, NULL, NULL, 'point_to_point',
    seed.fare, 'active',
    (SELECT id FROM public.operators WHERE display_name = 'Travel With Hawkins'),
    seed.commission_amount, 'fixed'
FROM (VALUES
    ('Blantyre', 120000, 2500),
    ('Karonga', 45000, 1500),
    ('Kasungu', 60000, 0),
    ('Lilongwe', 70000, 2000),
    ('Zomba', 110000, 2500)
) AS seed(destination, fare, commission_amount)
ON CONFLICT (origin_district, destination_label) WHERE direction = 'point_to_point' DO NOTHING;

-- Verification (run after applying):
--   SELECT origin_district, destination_label, fare, commission_amount, status, direction
--   FROM public.routes WHERE direction = 'point_to_point' ORDER BY destination_label;
--   -- expect exactly 5 rows matching the fares/commissions listed above, all 'active'.
