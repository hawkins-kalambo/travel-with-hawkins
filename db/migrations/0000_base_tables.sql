-- Reconstructed base schema for public.bookings, public.settings, and
-- public.admins.
--
-- These three tables predate db/migrations entirely — they were created by
-- hand (almost certainly via the Supabase dashboard Table Editor, based on
-- the auto-generated `<table>_<column>_key` constraint names, which is what
-- the Table Editor produces when you tick "Is Unique" on a column) before
-- any migration file existed. Every other migration in this repo assumes
-- they already exist, which means a truly empty database cannot bootstrap
-- from db/migrations alone without this file running first.
--
-- This file reconstructs only the ORIGINAL shape of each table — the
-- columns and constraints that existed before the first tracked migration
-- touched them. It was built by reading every column, primary key, foreign
-- key, and unique constraint back from the live production database on
-- 2026-08-10, then subtracting every column/constraint that a later,
-- already-tracked migration adds itself (so nothing here duplicates or
-- conflicts with what those files already do):
--   - referral_system_migration.sql adds bookings.referral_code,
--     .ambassador_id, .referral_source, .commission_amount, .referral_status
--   - customer_authentication_system.sql adds bookings.customer_id
--   - 2026_08_01_payments_wallet_audit_foundation.sql adds
--     bookings.booking_fee_amount, .booking_fee_status, .booking_fee_paid_at,
--     .fare_status, .fare_payment_method, .fare_paid_at,
--     .fare_cash_collected_by, .fare_cash_collected_at, .booking_expires_at
--   - 2026_08_01_payment_finalization_safety.sql sets booking_id NOT NULL
--     and adds the bookings_booking_id_unique + not-blank constraints
--   - 2026_08_01_settings_route_objects_column.sql adds settings.route_objects
--   - 2026_08_04_universities_and_structured_routes.sql adds
--     bookings.route_id, .university_id
--   - 2026_08_08_directional_routes.sql adds bookings.journey_direction,
--     .home_district, .journey_origin, .journey_destination
--   - 2026_08_09_district_pickup_points.sql adds
--     bookings.district_pickup_point_id, .university_pickup_point_id
--
-- Run this first, before referral_system_migration.sql, on any database
-- that doesn't already have these three tables. On production (where they
-- already exist) every statement below is a safe no-op.
--
-- admins.id and bookings.fare_cash_collected_by reference auth.users(id);
-- everything else here is self-contained.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.admins (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    super_admin TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_fee INTEGER,
    booking_fee INTEGER,
    max_seats INTEGER,
    routes TEXT,
    updated_at TIMESTAMP DEFAULT now()
);

-- booking_id is UNIQUE but deliberately not NOT NULL here — that constraint
-- is added later, by 2026_08_01_payment_finalization_safety.sql, exactly as
-- it already happened in production's real history.
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id TEXT UNIQUE,
    name TEXT,
    student_id TEXT,
    phone TEXT,
    destination TEXT,
    travel_date DATE,
    seats INTEGER DEFAULT 1,
    pickup TEXT,
    trip_id TEXT,
    status TEXT DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT now(),
    email TEXT,
    location TEXT,
    booking_type TEXT,
    payment_status TEXT DEFAULT 'Pending',
    payment_confirmed_at TIMESTAMP,
    receipt_number TEXT,
    receipt_sent BOOLEAN DEFAULT false,
    payment_notes TEXT,
    fare BIGINT
);

-- Verification (run after applying, against a fresh database):
--   SELECT table_name, count(*) FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name IN ('admins', 'settings', 'bookings')
--   GROUP BY table_name;
--   -- expect admins 5, settings 6, bookings 20 (booking_id counted once;
--   -- every other column added by later tracked migrations is intentionally
--   -- absent until those files run).
