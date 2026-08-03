# Ambassador applications migration

This folder contains SQL and guidance for creating the `ambassador_applications` table and related configuration.

Steps to apply:

1. Open the Supabase SQL editor (or connect with `psql` as a superuser).
2. Run `db/ambassador_applications_migration.sql`.
3. Run `db/migrations/2026_08_01_reconcile_ambassador_applications.sql` — this is not
   optional. It enables Row Level Security on the table (step 2 above leaves it
   disabled) and adds the real policies, plus the duplicate-application
   uniqueness constraint. This table stores applicant PII (student ID, phone,
   motivation essay), so skipping this step leaves that data unprotected.
4. Verify the table exists and RLS is on:
   `SELECT relrowsecurity FROM pg_class WHERE relname = 'ambassador_applications';` — should return `t`.

Storage bucket setup (Supabase UI or CLI):

- Bucket name: `ambassador-profiles`
- Recommended path: `applicants/{applicationId}/{filename}`
- Public read for admin views, secure uploads via signed URLs for client uploads.

RLS and security:

- RLS is enabled by step 3 above, with policies for service-role/admin full
  access, public insert-only (application submission), and applicant
  self-select/update scoped to their own row — see
  `db/migrations/2026_08_01_reconcile_ambassador_applications.sql` for the
  exact policies.
