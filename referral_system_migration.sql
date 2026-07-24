-- Travel with Hawkins Ambassador Management Migration

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin', 'ambassador', 'customer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ambassadors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    student_id TEXT,
    phone TEXT NOT NULL,
    whatsapp_number TEXT,
    email TEXT,
    university TEXT NOT NULL DEFAULT 'Mzuzu University',
    faculty TEXT,
    program TEXT,
    year_of_study INTEGER,
    profile_image_url TEXT,
    referral_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'pending verification')),
    last_login TIMESTAMPTZ,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    suspension_reason TEXT,
    last_password_change TIMESTAMPTZ,
    created_by_admin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID REFERENCES public.ambassadors(id) ON DELETE SET NULL,
    booking_id TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    route TEXT,
    travel_date TEXT,
    commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    commission_status TEXT NOT NULL DEFAULT 'pending' CHECK (commission_status IN ('pending', 'approved', 'paid', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    CONSTRAINT referrals_booking_unique UNIQUE (booking_id)
);

CREATE TABLE IF NOT EXISTS public.commission_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_name TEXT NOT NULL,
    commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    currency TEXT NOT NULL DEFAULT 'MWK',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commission_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID REFERENCES public.ambassadors(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_method TEXT,
    payment_reference TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID REFERENCES public.ambassadors(id) ON DELETE CASCADE,
    route TEXT,
    travel_date TEXT,
    file_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS referral_code TEXT,
    ADD COLUMN IF NOT EXISTS ambassador_id UUID,
    ADD COLUMN IF NOT EXISTS referral_source TEXT,
    ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS referral_status TEXT DEFAULT 'pending';

ALTER TABLE public.ambassadors
    ADD COLUMN IF NOT EXISTS student_id TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
    ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
    ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
    ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_by_admin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_ambassadors_profile_id ON public.ambassadors (profile_id);
CREATE INDEX IF NOT EXISTS idx_ambassadors_referral_code ON public.ambassadors (referral_code);
CREATE INDEX IF NOT EXISTS idx_ambassadors_status ON public.ambassadors (status);
CREATE INDEX IF NOT EXISTS idx_ambassadors_last_login ON public.ambassadors (last_login);
CREATE INDEX IF NOT EXISTS idx_ambassadors_is_verified ON public.ambassadors (is_verified);
CREATE INDEX IF NOT EXISTS idx_referrals_ambassador_id ON public.referrals (ambassador_id);
CREATE INDEX IF NOT EXISTS idx_referrals_booking_id ON public.referrals (booking_id);
CREATE INDEX IF NOT EXISTS idx_referrals_commission_status ON public.referrals (commission_status);
CREATE INDEX IF NOT EXISTS idx_bookings_referral_code ON public.bookings (referral_code);

CREATE TABLE IF NOT EXISTS public.ambassador_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID REFERENCES public.ambassadors(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read_status BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_ambassador_id ON public.ambassador_activity_logs (ambassador_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read_status ON public.notifications (read_status);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_ambassadors_updated_at ON public.ambassadors;
CREATE TRIGGER set_ambassadors_updated_at
BEFORE UPDATE ON public.ambassadors
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_commission_rules_updated_at ON public.commission_rules;
CREATE TRIGGER set_commission_rules_updated_at
BEFORE UPDATE ON public.commission_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_referrals_updated_at ON public.referrals;
CREATE TRIGGER set_referrals_updated_at
BEFORE UPDATE ON public.referrals
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassadors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manifests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_admin_full_access ON public.profiles;
CREATE POLICY profiles_admin_full_access
ON public.profiles
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS profiles_self_read_update ON public.profiles;
CREATE POLICY profiles_self_read_update
ON public.profiles
FOR SELECT, UPDATE
TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS ambassadors_admin_full_access ON public.ambassadors;
CREATE POLICY ambassadors_admin_full_access
ON public.ambassadors
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS ambassadors_ambassador_own_view ON public.ambassadors;
CREATE POLICY ambassadors_ambassador_own_view
ON public.ambassadors
FOR SELECT
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'ambassador')
    AND profile_id = auth.uid()
);

DROP POLICY IF EXISTS referrals_admin_full_access ON public.referrals;
CREATE POLICY referrals_admin_full_access
ON public.referrals
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS referrals_ambassador_own_view ON public.referrals;
CREATE POLICY referrals_ambassador_own_view
ON public.referrals
FOR SELECT
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'ambassador')
    AND ambassador_id IN (
        SELECT id
        FROM public.ambassadors
        WHERE profile_id = auth.uid()
    )
);

DROP POLICY IF EXISTS commission_rules_admin_full_access ON public.commission_rules;
CREATE POLICY commission_rules_admin_full_access
ON public.commission_rules
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS commission_transactions_admin_full_access ON public.commission_transactions;
CREATE POLICY commission_transactions_admin_full_access
ON public.commission_transactions
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS manifests_admin_full_access ON public.manifests;
CREATE POLICY manifests_admin_full_access
ON public.manifests
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'));

INSERT INTO public.commission_rules (route_name, commission_amount, currency, status)
VALUES
    ('Mzuzu - Lilongwe', 2000, 'MWK', 'active'),
    ('Mzuzu - Blantyre', 2500, 'MWK', 'active'),
    ('Mzuzu - Zomba', 2500, 'MWK', 'active'),
    ('Mzuzu - Karonga', 1500, 'MWK', 'active')
ON CONFLICT DO NOTHING;

-- Ambassador applications table: stores public applications from students
CREATE TABLE IF NOT EXISTS public.ambassador_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    student_id TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    whatsapp_number TEXT,
    university TEXT NOT NULL DEFAULT 'Mzuzu University',
    faculty TEXT,
    program TEXT NOT NULL,
    year_of_study INTEGER,
    profile_image_url TEXT,
    motivation TEXT NOT NULL,
    leadership_experience TEXT,
    marketing_experience TEXT,
    social_media_influence TEXT,
    communities TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by_id UUID REFERENCES public.profiles(id),
    rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_applications_email ON public.ambassador_applications (email);
CREATE INDEX IF NOT EXISTS idx_applications_student_id ON public.ambassador_applications (student_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.ambassador_applications (status);

-- Reuse the existing set_updated_at trigger function for applications
DROP TRIGGER IF EXISTS set_ambassador_applications_updated_at ON public.ambassador_applications;
CREATE TRIGGER set_ambassador_applications_updated_at
BEFORE UPDATE ON public.ambassador_applications
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS for applications
ALTER TABLE public.ambassador_applications ENABLE ROW LEVEL SECURITY;

-- Policies:
-- 1) Admins: full access
DROP POLICY IF EXISTS applications_admin_full_access ON public.ambassador_applications;
CREATE POLICY applications_admin_full_access
ON public.ambassador_applications
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS applications_public_insert ON public.ambassador_applications;
CREATE POLICY applications_public_insert
ON public.ambassador_applications
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 3) Applicants can view their own application (SELECT) by matching email
DROP POLICY IF EXISTS applications_self_select ON public.ambassador_applications;
CREATE POLICY applications_self_select
ON public.ambassador_applications
FOR SELECT
TO authenticated
USING (email = auth.email());

-- 4) Applicants may update their own application while pending (UPDATE)
DROP POLICY IF EXISTS applications_self_update ON public.ambassador_applications;
CREATE POLICY applications_self_update
ON public.ambassador_applications
FOR UPDATE
TO authenticated
USING (email = auth.email() AND status = 'pending')
WITH CHECK (email = auth.email() AND status = 'pending');

-- 5) Only admins can approve/reject applications (UPDATE)
DROP POLICY IF EXISTS applications_admin_update_status ON public.ambassador_applications;
CREATE POLICY applications_admin_update_status
ON public.ambassador_applications
FOR UPDATE
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Prevent duplicate applications by email + student_id
CREATE UNIQUE INDEX IF NOT EXISTS ux_applications_email_student ON public.ambassador_applications (LOWER(email), student_id);

-- Storage bucket instructions (Supabase console or CLI):
-- Bucket: ambassador-profiles
-- Public read for profile viewing by admins; use signed URLs for secure delivery
-- Recommended: restrict uploads via API using Service Role key or signed upload URLs

