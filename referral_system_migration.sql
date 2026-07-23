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
    phone TEXT NOT NULL,
    email TEXT,
    university TEXT NOT NULL DEFAULT 'Mzuzu University',
    faculty TEXT,
    program TEXT,
    year_of_study INTEGER,
    referral_code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
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

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_ambassadors_profile_id ON public.ambassadors (profile_id);
CREATE INDEX IF NOT EXISTS idx_ambassadors_referral_code ON public.ambassadors (referral_code);
CREATE INDEX IF NOT EXISTS idx_ambassadors_status ON public.ambassadors (status);
CREATE INDEX IF NOT EXISTS idx_referrals_ambassador_id ON public.referrals (ambassador_id);
CREATE INDEX IF NOT EXISTS idx_referrals_booking_id ON public.referrals (booking_id);
CREATE INDEX IF NOT EXISTS idx_referrals_commission_status ON public.referrals (commission_status);
CREATE INDEX IF NOT EXISTS idx_bookings_referral_code ON public.bookings (referral_code);

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
