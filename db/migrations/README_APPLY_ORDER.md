# Fresh database bootstrap order

Every file below in one sequence, verified against actual dependencies (not
just filename dates) on 2026-08-10 — this is what to run, in order, against
a brand-new empty database (e.g. a staging Supabase project). Each numbered
group below has its own section further down this file with caveats worth
reading before you run it; this list just establishes the full order.

`public.bookings`, `public.settings`, and `public.admins` predate this
migrations folder entirely — they were created by hand, and nothing in this
repo ever issues a `CREATE TABLE` for them. `0000_base_tables.sql`
reconstructs their original shape (verified column-by-column and
constraint-by-constraint against production) specifically so a fresh
database has something for every other file to `ALTER TABLE` against.

1. `0000_base_tables.sql`
2. `../referral_system_migration.sql` (repo root)
3. `customer_authentication_system.sql`
4. `2026_08_01_fix_profiles_and_admin_role_rls.sql`
5. `2026_08_01_declare_ambassadors_user_id.sql`
6. `2026_08_01_enable_rls_activity_notifications.sql`
7. `2026_08_01_reconcile_ambassador_applications.sql`
8. `2026_08_01_commission_lifecycle_and_currency.sql`
9. `2026_08_01_rate_limit_table.sql`
10. `2026_08_01_reconcile_communication_center.sql`
11. `2026_08_01_settings_route_objects_column.sql`
12. `2026_08_01_payments_wallet_audit_foundation.sql`
13. `2026_08_01_payment_finalization_safety.sql`
14. `2026_08_01_finalize_payment_rpc.sql`
15. `2026_08_02_customer_email_otp.sql`
16. `2026_08_02_customer_otp_sms_channel.sql`
17. `2026_08_03_pin_search_path_legacy_functions.sql`
18. `2026_08_03_ensure_profiles_ambassadors_referrals_rls.sql`
19. `2026_08_03_drop_stale_communication_staging_policies.sql`
20. `2026_08_03_enable_rls_bookings_settings_admins.sql`
21. `2026_08_03_booking_dedupe_claim.sql`
22. `2026_08_03_release_booking_dedupe_claim.sql`
23. `2026_08_04_universities_and_structured_routes.sql`
24. `2026_08_04_route_commission_fields.sql`
25. `2026_08_07_manual_fare_and_receipt_delivery.sql`
26. `2026_08_08_directional_routes.sql`
27. `2026_08_08_university_admin_assignments.sql`
28. `2026_08_08_ambassador_university_scope.sql`
29. `2026_08_09_district_pickup_points.sql`
30. `2026_08_10_operators_fleet_foundation.sql`
31. `2026_08_10_operator_documents_storage_bucket.sql`

**Do not run these three** — each is superseded or actively conflicts with
a file already in the list above:

- `add_role_constraints_to_profiles.sql` — has no `DROP CONSTRAINT IF EXISTS`
  guard and will error (`constraint "profiles_role_check" already exists`)
  against the inline check `referral_system_migration.sql` already creates.
  It's also redundant: `2026_08_08_university_admin_assignments.sql` and
  `2026_08_10_operators_fleet_foundation.sql` both replace that same
  constraint with a strictly wider value set.
- `communication_center_2026_07_24.sql` — an earlier draft of the schema
  `2026_08_01_reconcile_communication_center.sql` fully and idempotently
  subsumes; harmless but pointless to run.
- `communication_center_rls_staging.sql` — its policies use a different
  naming scheme than the reconcile migration's, so its `USING (true)`
  public-read policy on announcements never gets cleaned up by the later
  file's `DROP POLICY IF EXISTS` and silently defeats the intended
  audience-scoped read policy. `2026_08_03_drop_stale_communication_staging_policies.sql`
  exists specifically to clean this up if it's ever run by accident — keep
  that file in the sequence above even though it'll no-op if you skip this one.

Also out of scope entirely (superseded originals, not part of `db/migrations/`):
`db/ambassador_applications_migration.sql` and `db/communication_center_migration.sql`.

After the full sequence, run each file's own "Verification" block (where
present) and confirm the result matches what's described, same as any
individual migration below.

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
