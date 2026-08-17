-- app/api/settings/route.ts (shipped in 77dbdc9, "Add university routing and
-- booking operations upgrades") reads/writes five JSONB columns on
-- public.settings that were never migrated: notification_settings,
-- system_preferences, trip_rules, payment_settings, referral_program.
--
-- On a database missing them, GET /api/settings works fine as long as a
-- settings row already exists (its SELECT * doesn't care about columns it
-- doesn't ask for by name) -- but if the table is ever empty, the route's
-- own fallback tries to INSERT a defaults row that includes all five
-- columns, which fails with PostgREST error PGRST204 ("column does not
-- exist"), taking GET /api/settings down entirely (500) until a row exists.
-- That in turn breaks anything that depends on it, including the booking
-- fee resolving correctly on new bookings.
--
-- Column-level defaults below are copied verbatim from that same file's
-- GET handler (its `defaults` object) -- not a guess at the intended shape,
-- just making the schema match code that's already shipped.
--
-- Idempotent: safe to run multiple times.

ALTER TABLE public.settings
    ADD COLUMN IF NOT EXISTS notification_settings JSONB NOT NULL DEFAULT '{
        "bookingConfirmationEmail": true,
        "bookingConfirmationSms": false,
        "ambassadorNotifications": true,
        "commissionApprovalNotifications": true,
        "tripReminderNotifications": true
    }'::jsonb,
    ADD COLUMN IF NOT EXISTS system_preferences JSONB NOT NULL DEFAULT '{
        "companyName": "Travel with Hawkins",
        "companyLogoUrl": "/logo.png",
        "supportEmail": "support@travelwithhawkins.com",
        "supportPhone": "+265 999 000 000",
        "bookingTerms": "Booking terms and conditions apply.",
        "privacyPolicy": "Your data is handled securely."
    }'::jsonb,
    ADD COLUMN IF NOT EXISTS trip_rules JSONB NOT NULL DEFAULT '{
        "maxPassengersPerTrip": 15,
        "bookingDeadlineHours": 24,
        "cancellationDeadlineHours": 6,
        "autoBookingConfirmation": false,
        "autoCommissionCreation": true,
        "autoCommissionApproval": false
    }'::jsonb,
    ADD COLUMN IF NOT EXISTS payment_settings JSONB NOT NULL DEFAULT '{
        "currency": "MWK",
        "defaultPaymentMethods": ["Airtel Money", "TNM Mpamba", "Bank Transfer", "Cash"],
        "defaultPaymentStatus": "Pending",
        "allowPartialPayments": false,
        "generateReceiptsAutomatically": true
    }'::jsonb,
    ADD COLUMN IF NOT EXISTS referral_program JSONB NOT NULL DEFAULT '{
        "enabled": true,
        "allowReferralWithoutLogin": false,
        "requireAmbassadorApproval": false,
        "defaultAmbassadorStatus": "active",
        "referralCodeLength": 6,
        "referralCodePrefix": "ENG2026",
        "maxReferralsPerStudent": null,
        "minimumBookingValue": 0,
        "defaultCommissionStatus": "pending"
    }'::jsonb;

-- The table is currently empty on staging, which is what actually surfaces
-- the bug (the fallback INSERT never runs while at least one row exists).
-- Seed one row with the real values last confirmed directly against
-- production on 2026-08-11 (see 2026_08_11_mzuni_routes_real_fares.sql) --
-- NOT the app's own hardcoded placeholder fares (5000/8000/7000/3000/6000),
-- which were already found to be stale once this session. Leaves the newer
-- business-configuration fields at their column defaults above.
INSERT INTO public.settings (booking_fee, max_seats, routes, route_objects)
SELECT
    5000,
    15,
    'Mzuzu - Blantyre: 120000
Mzuzu - Karonga: 45000
Mzuzu - Kasungu: 60000
Mzuzu - Lilongwe: 70000
Mzuzu - Zomba: 110000',
    '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.settings);

-- Verification (run after applying):
--   SELECT count(*) FROM public.settings;
--   -- expect at least 1.
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'settings'
--     AND column_name IN ('notification_settings', 'system_preferences', 'trip_rules', 'payment_settings', 'referral_program');
--   -- expect 5 rows.
