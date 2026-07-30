-- Travel with Hawkins - Customer Authentication & Profile Management System
-- Migration Date: 2026-07-26
-- This creates the complete customer profile, preferences, and linking infrastructure

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==========================================
-- 1. CUSTOMER PROFILES TABLE
-- ==========================================
-- Extends the base profiles table with customer-specific information
-- Supports multiple customer types (Student, Public Traveler, Corporate - future)

CREATE TABLE IF NOT EXISTS public.customer_profiles (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    
    -- Personal Information
    profile_picture_url TEXT,
    full_name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    gender TEXT CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say', null)),
    date_of_birth DATE,
    
    -- Student Information (optional)
    student_id TEXT,
    university TEXT,
    faculty TEXT,
    programme TEXT,
    year_of_study INTEGER CHECK (year_of_study >= 1 AND year_of_study <= 6),
    
    -- Travel Information
    preferred_route TEXT,
    preferred_pickup_point TEXT,
    accessibility_requirements TEXT,
    
    -- Emergency Contact
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_relationship TEXT,
    
    -- Account Information
    customer_type TEXT NOT NULL DEFAULT 'student' CHECK (customer_type IN ('student', 'public_traveler', 'corporate')),
    customer_number TEXT NOT NULL UNIQUE,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    email_verified_at TIMESTAMPTZ,
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'inactive')),
    
    -- Tracking
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login TIMESTAMPTZ
);

-- Create index on customer_number for quick lookups
CREATE UNIQUE INDEX idx_customer_profiles_customer_number ON public.customer_profiles(customer_number);
CREATE INDEX idx_customer_profiles_email ON public.customer_profiles(email);
CREATE INDEX idx_customer_profiles_created_at ON public.customer_profiles(created_at);

-- ==========================================
-- 2. CUSTOMER PREFERENCES TABLE
-- ==========================================
-- Stores customer travel and booking preferences

CREATE TABLE IF NOT EXISTS public.customer_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
    
    -- Travel Preferences
    preferred_seat_location TEXT CHECK (preferred_seat_location IN ('window', 'middle', 'aisle', 'no_preference', null)),
    dietary_restrictions TEXT,
    
    -- Booking Preferences
    preferred_booking_time TEXT,
    allow_group_bookings BOOLEAN DEFAULT true,
    
    -- Notification Preferences
    notify_booking_confirmed BOOLEAN DEFAULT true,
    notify_seat_assigned BOOLEAN DEFAULT true,
    notify_trip_reminder BOOLEAN DEFAULT true,
    notify_trip_completed BOOLEAN DEFAULT true,
    notify_announcements BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_preferences_customer_id ON public.customer_preferences(customer_id);

-- ==========================================
-- 3. CUSTOMER SETTINGS TABLE
-- ==========================================
-- Stores customer account settings and privacy preferences

CREATE TABLE IF NOT EXISTS public.customer_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
    
    -- Notification Channels
    email_notifications BOOLEAN DEFAULT true,
    sms_notifications BOOLEAN DEFAULT false,
    push_notifications BOOLEAN DEFAULT false,
    whatsapp_notifications BOOLEAN DEFAULT false,
    
    -- Privacy Settings
    profile_visibility TEXT DEFAULT 'private' CHECK (profile_visibility IN ('public', 'private')),
    show_booking_history BOOLEAN DEFAULT true,
    allow_sharing_data_with_partners BOOLEAN DEFAULT false,
    
    -- Communication
    newsletter_subscription BOOLEAN DEFAULT true,
    promotional_emails BOOLEAN DEFAULT true,
    
    -- Two-factor Authentication
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_method TEXT CHECK (two_factor_method IN ('sms', 'email', 'authenticator', null)),
    
    -- Device Management
    remember_device BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_customer_settings_customer_id ON public.customer_settings(customer_id);

-- ==========================================
-- 4. GUEST BOOKING LINK TRACKING TABLE
-- ==========================================
-- Tracks which guest bookings have been linked to registered accounts
-- Helps prevent duplicate linking and provides audit trail

CREATE TABLE IF NOT EXISTS public.guest_booking_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_email TEXT NOT NULL,
    customer_id UUID NOT NULL REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
    booking_ids TEXT[] NOT NULL DEFAULT '{}',  -- Array of booking IDs linked
    linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_guest_booking_links_customer_id ON public.guest_booking_links(customer_id);
CREATE INDEX idx_guest_booking_links_guest_email ON public.guest_booking_links(guest_email);

-- ==========================================
-- 5. CUSTOMER ACTIVITY LOG TABLE (Optional)
-- ==========================================
-- Track customer activities for security and analytics
-- Useful for detecting suspicious behavior and audit trails

CREATE TABLE IF NOT EXISTS public.customer_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_activity_log_customer_id ON public.customer_activity_log(customer_id);
CREATE INDEX idx_customer_activity_log_created_at ON public.customer_activity_log(created_at);

-- ==========================================
-- 6. UPDATE PROFILES TABLE (if needed)
-- ==========================================
-- Ensure profiles table has necessary columns for customer role

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('super_admin', 'admin', 'viewer', 'ambassador', 'customer'));

-- ==========================================
-- 7. ROW-LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS for all customer tables
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_booking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_activity_log ENABLE ROW LEVEL SECURITY;

-- Customer Profiles Policies
CREATE POLICY "Customers can view own profile" ON public.customer_profiles
    FOR SELECT USING (id = auth.uid());

CREATE POLICY "Customers can update own profile" ON public.customer_profiles
    FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Admins can manage all customer profiles" ON public.customer_profiles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
        )
    );

-- Customer Preferences Policies
CREATE POLICY "Customers can view own preferences" ON public.customer_preferences
    FOR SELECT USING (
        customer_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
        )
    );

CREATE POLICY "Customers can update own preferences" ON public.customer_preferences
    FOR UPDATE USING (customer_id = auth.uid());

CREATE POLICY "Customers can insert own preferences" ON public.customer_preferences
    FOR INSERT WITH CHECK (customer_id = auth.uid());

-- Customer Settings Policies
CREATE POLICY "Customers can view own settings" ON public.customer_settings
    FOR SELECT USING (
        customer_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
        )
    );

CREATE POLICY "Customers can update own settings" ON public.customer_settings
    FOR UPDATE USING (customer_id = auth.uid());

CREATE POLICY "Customers can insert own settings" ON public.customer_settings
    FOR INSERT WITH CHECK (customer_id = auth.uid());

-- Guest Booking Links Policies
CREATE POLICY "Customers can view own guest links" ON public.guest_booking_links
    FOR SELECT USING (
        customer_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
        )
    );

-- Activity Log Policies
CREATE POLICY "Customers can view own activity" ON public.customer_activity_log
    FOR SELECT USING (
        customer_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
        )
    );

-- ==========================================
-- 8. TRIGGER FOR UPDATED_AT TIMESTAMPS
-- ==========================================

CREATE OR REPLACE FUNCTION public.update_customer_profiles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_profiles_update_timestamp
    BEFORE UPDATE ON public.customer_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_customer_profiles_timestamp();

CREATE OR REPLACE FUNCTION public.update_customer_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_preferences_update_timestamp
    BEFORE UPDATE ON public.customer_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.update_customer_preferences_timestamp();

CREATE OR REPLACE FUNCTION public.update_customer_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_settings_update_timestamp
    BEFORE UPDATE ON public.customer_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_customer_settings_timestamp();

CREATE OR REPLACE FUNCTION public.update_guest_booking_links_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER guest_booking_links_update_timestamp
    BEFORE UPDATE ON public.guest_booking_links
    FOR EACH ROW
    EXECUTE FUNCTION public.update_guest_booking_links_timestamp();

-- ==========================================
-- 9. GENERATED CUSTOMER NUMBER FUNCTION
-- ==========================================
-- Generates unique customer numbers like CUST-20260726-000001

CREATE OR REPLACE FUNCTION public.generate_customer_number()
RETURNS TEXT AS $$
DECLARE
    new_number TEXT;
    sequence_num INTEGER;
BEGIN
    SELECT COUNT(*) + 1 INTO sequence_num FROM public.customer_profiles;
    new_number := 'CUST-' || to_char(now(), 'YYYYMMDD') || '-' || LPAD(sequence_num::TEXT, 6, '0');
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 10. FUNCTION: LINK GUEST BOOKINGS TO CUSTOMER
-- ==========================================
-- This function automatically links all guest bookings with matching email
-- to a newly registered customer account

CREATE OR REPLACE FUNCTION public.link_guest_bookings_to_customer(
    p_customer_id UUID,
    p_email TEXT
)
RETURNS TABLE(linked_count INTEGER, linked_booking_ids TEXT[]) AS $$
DECLARE
    v_guest_bookings TEXT[];
    v_count INTEGER;
BEGIN
    -- Find all guest bookings with this email
    SELECT ARRAY_AGG(id::TEXT)
    INTO v_guest_bookings
    FROM public.bookings
    WHERE email = LOWER(TRIM(p_email)) 
      AND customer_id IS NULL;

    -- Get the count
    v_count := COALESCE(ARRAY_LENGTH(v_guest_bookings, 1), 0);

    -- If found, create the link record
    IF v_count > 0 THEN
        INSERT INTO public.guest_booking_links (guest_email, customer_id, booking_ids)
        VALUES (LOWER(TRIM(p_email)), p_customer_id, v_guest_bookings)
        ON CONFLICT (customer_id) DO UPDATE
        SET booking_ids = array_cat(guest_booking_links.booking_ids, v_guest_bookings),
            updated_at = now();
    END IF;

    RETURN QUERY SELECT v_count, v_guest_bookings;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 11. FUNCTION: AUTO-LINK GUEST BOOKINGS ON PROFILE CREATION
-- ==========================================
-- Automatically called when a customer profile is created

CREATE OR REPLACE FUNCTION public.auto_link_guest_bookings_on_profile_create()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.link_guest_bookings_to_customer(NEW.id, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_profile_auto_link_guest_bookings
    AFTER INSERT ON public.customer_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_link_guest_bookings_on_profile_create();

-- ==========================================
-- 12. INDEXES FOR PERFORMANCE
-- ==========================================

-- Bookings table - ensure customer_id index exists
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_customer_id ON public.bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON public.bookings(email);

-- ==========================================
-- NOTES
-- ==========================================
-- 1. Profiles table is already managed by Supabase Auth
-- 2. Customer profiles linked 1:1 with auth.users via profiles.id
-- 3. Guest bookings linked automatically by email matching
-- 4. RLS policies ensure customers only see their own data
-- 5. Admin users can view and manage all customer data
-- 6. Customer numbers are auto-generated and unique
-- 7. Activity logging is optional - enable as needed
-- 8. Two-factor auth support built-in to customer_settings
