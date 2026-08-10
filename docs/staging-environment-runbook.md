# Staging environment runbook

Stage 0 of the Marketplace Expansion plan calls for a staging environment fully isolated from production — separate Supabase project, separate PayChangu sandbox credentials, separate Vercel deployment. There's no Vercel CLI, Supabase CLI, or `gh` CLI available in this environment, so the steps below are dashboard actions for you to run once. Re-usable after that — this only needs to be done a single time.

## 1. Supabase staging project

1. In the Supabase dashboard, create a **new project** — e.g. `travel-with-hawkins-staging`. Same region as production for realistic latency.
2. Apply the schema: run every file under `db/` in the order documented in `db/migrations/README_APPLY_ORDER.md`, plus the root `referral_system_migration.sql` first (it's the foundational schema the `db/` migrations build on).
3. Seed enough reference data to develop against: at minimum one active university (mirror the MZUNI seed) and a test admin user via Supabase Auth.
4. Copy the new project's URL, anon key, and service-role key — you'll need these for step 3 below.

## 2. PayChangu sandbox credentials

1. In the PayChangu dashboard, confirm you have **sandbox/test** mode keys separate from the live production keys already in use (`PAYCHANGU_SECRET_KEY`, `PAYCHANGU_WEBHOOK_SECRET`).
2. This is also the moment to open the Connect commercial-terms conversation from the Stage 0 checklist — fee types, commission reversal, refund-by-method, payout permissions — since sandbox access and that conversation typically go through the same account contact.

## 3. Vercel staging deployment

1. In the Vercel dashboard, add a new **Environment** (Vercel calls this "Preview" or a custom environment depending on plan) scoped to a `staging` branch, distinct from the `main`-tracking Production environment.
2. Set these environment variables for the staging environment only — never copy production values in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → from the staging Supabase project (step 1.4)
   - `PAYCHANGU_SECRET_KEY`, `PAYCHANGU_WEBHOOK_SECRET`, `PAYCHANGU_BASE_URL` → sandbox values (step 2.1)
   - `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL` → the staging deployment's own URL, not `travelwithhawkins.com`
   - `RESEND_API_KEY`, `ADMIN_NOTIFICATION_EMAIL`, `AFRICASTALKING_USERNAME`, `AFRICASTALKING_API_KEY` → either sandbox/test values from those providers, or leave real ones out entirely and accept that email/SMS sends will fail quietly in staging (acceptable for a booking/payment-focused staging environment)
3. Create a long-lived `staging` git branch and push it — this triggers the first staging deployment.

## 4. Verify isolation

Before treating the environment as usable, confirm:

- [ ] Staging Supabase project has zero real customer/booking data
- [ ] Staging Vercel deployment's env vars point only at staging Supabase + sandbox PayChangu — grep the deployed environment variables in the Vercel dashboard to double check, don't just trust step 3
- [ ] Production's env vars were never touched during this process
- [ ] A test booking created in staging never appears in the production admin dashboard, and vice versa

## Ongoing use

- Feature branches for Marketplace Expansion work merge into `staging` first, get exercised there (including real PayChangu sandbox webhook round-trips), and only merge to `main` once verified — this is where Stage 4's split-payment testing and Stage 6's regression suite actually run before anything touches production.
- Keep this file updated if the environment split changes shape (e.g. if Supabase branching becomes available on your plan and replaces the separate-project approach).
