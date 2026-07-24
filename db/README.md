# Ambassador applications migration

This folder contains SQL and guidance for creating the `ambassador_applications` table and related configuration.

Steps to apply:

1. Open the Supabase SQL editor (or connect with `psql` as a superuser).
2. Run `db/ambassador_applications_migration.sql`.
3. Verify the table exists: `SELECT count(*) FROM public.ambassador_applications;`.

Storage bucket setup (Supabase UI or CLI):

- Bucket name: `ambassador-profiles`
- Recommended path: `applicants/{applicationId}/{filename}`
- Public read for admin views, secure uploads via signed URLs for client uploads.

RLS and security:

- Prefer server-side insertion using a service role key for uploads and inserts.
- If enabling RLS, add policies that only allow the service role to INSERT, and only admins to SELECT/UPDATE/DELETE.
