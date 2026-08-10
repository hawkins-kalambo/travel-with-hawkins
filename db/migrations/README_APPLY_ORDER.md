# Applying the 2026-08-01 ambassador-system-fix migrations

These seven files were written together as part of the ambassador-system audit
and rebuild (see `docs/ambassador-system-audit.md`) and are meant to be applied
in this order, via the Supabase SQL editor or `psql`, against production. None
of them were executed automatically — review each one before running it.

Run each file in full, then run its "Verification" query block (at the bottom
of each file) and confirm the result looks as described before moving to the
next file.

1. `2026_08_01_fix_profiles_and_admin_role_rls.sql`
2. `2026_08_01_declare_ambassadors_user_id.sql`
3. `2026_08_01_enable_rls_activity_notifications.sql`
4. `2026_08_01_reconcile_ambassador_applications.sql`
   — **Stop and read this one carefully before running:** it will refuse to
   add the new duplicate-application unique index if any existing rows in
   `ambassador_applications` already share the same (email, student_id).
   If it raises that exception, resolve the flagged duplicates manually,
   then re-run the file.
5. `2026_08_01_commission_lifecycle_and_currency.sql`
   — Changes `commission_amount` from `NUMERIC(12,2)` to `BIGINT` on three
   tables. Existing values are rounded to the nearest whole MWK first (a
   no-op for real data, since application code has only ever produced
   whole-MWK values). Take a quick look at row counts before/after if you
   want extra peace of mind.
6. `2026_08_01_rate_limit_table.sql`
7. `2026_08_01_reconcile_communication_center.sql`
   — **Read the comment block at the top of this file before running.**
   It's written defensively (every column is `ADD COLUMN IF NOT EXISTS`,
   nothing is renamed), but if your live `communication_messages` table
   currently has the older `message_type`/`metadata` shape instead of
   `body`/`html`/`attachments`, you'll want to check for and manually
   backfill any real historical message data — this migration adds the
   canonical columns alongside old ones rather than guessing at a data
   migration.

After all seven are applied, redeploy the application code from this same
change (they're designed to be applied together — several application-code
fixes assume the schema changes above are already in place, e.g. the
commission-reversal logic assumes `referrals.cancelled_reason`/`reversed_at`
exist, and the rate limiter assumes `rate_limit_hit()` exists).

## University route migrations

Apply these in order before deploying the directional booking flow:

1. `2026_08_04_universities_and_structured_routes.sql`
2. `2026_08_04_route_commission_fields.sql`
3. `2026_08_08_directional_routes.sql`
4. `2026_08_08_university_admin_assignments.sql`
5. `2026_08_08_ambassador_university_scope.sql`
6. `2026_08_09_district_pickup_points.sql`

The directional-routes migration keeps every existing structured route as
`to_university`, creates an independently editable `from_university` reverse
leg, and adds nullable journey-direction fields to bookings. It is required
before the directional application code is deployed.

The university-admin migration must be applied before assigning the
`university_admin` role. It preserves existing `super_admin` and `admin`
behavior while adding explicit user-to-university operational assignments.
The ambassador-scope migration then backfills and protects university
ownership across applications, ambassadors, referrals, and commissions.

## Marketplace Expansion — Stage 1 (shared data foundation)

Apply after all of the above:

1. `2026_08_10_operators_fleet_foundation.sql`

Introduces `operators`, `operator_memberships`, `service_approvals`,
`vehicles`, `drivers`, and `operator_documents` — none of which exist before
this migration. Also makes `routes.university_id` nullable, adds
`routes.operator_id` and `routes.destination_label` so a route can terminate
at a plain public destination instead of only a university, and backfills a
single internal "Travel With Hawkins" operator onto every existing route so
nothing customer-facing changes. See `docs/route-model-decision.md` for the
reasoning behind generalizing `routes` instead of building a third,
operator-aware route system alongside the existing two. Purely additive and
schema-only — no application code depends on any of this yet (that starts
Stage 2).
