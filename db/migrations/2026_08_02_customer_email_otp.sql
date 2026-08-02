-- Travel with Hawkins - Customer email OTP verification + profile picture storage
-- Migration Date: 2026-08-02

-- ==========================================
-- 1. CUSTOMER EMAIL OTP TABLE
-- ==========================================
-- Stores hashed one-time codes sent to customers to verify their email
-- address after registration. Only the service-role client should ever
-- touch this table (no RLS policies are added on purpose).

CREATE TABLE IF NOT EXISTS public.customer_email_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_email_otps_customer_id ON public.customer_email_otps(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_email_otps_email ON public.customer_email_otps(email);

ALTER TABLE public.customer_email_otps ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 2. CUSTOMER PROFILE PICTURE STORAGE BUCKET
-- ==========================================
-- Public read (so profile picture URLs render directly), writes are
-- always performed server-side with the service-role key.

INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-profiles', 'customer-profiles', true)
ON CONFLICT (id) DO NOTHING;
