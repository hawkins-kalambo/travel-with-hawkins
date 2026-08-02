-- Travel with Hawkins - Add SMS as a delivery channel for customer OTPs
-- Migration Date: 2026-08-02
-- Depends on: 2026_08_02_customer_email_otp.sql (public.customer_email_otps)

ALTER TABLE public.customer_email_otps
    ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
    ADD COLUMN IF NOT EXISTS phone TEXT;
