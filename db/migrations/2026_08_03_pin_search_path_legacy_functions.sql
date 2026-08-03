-- These functions predate the SECURITY DEFINER + `SET search_path = ''`
-- convention every newer function in this repo follows, and Supabase's own
-- linter flags the gap. None of them are SECURITY DEFINER (they run as the
-- invoking role, not an elevated one), so the practical risk is low — but
-- an unpinned search_path still means a role that can create objects in a
-- schema earlier in its own search_path could shadow an unqualified
-- identifier. All table/function references in these bodies are already
-- schema-qualified (`public.xxx`), so pinning `search_path = ''` is a
-- no-behavior-change hardening, not a fix for an active bug.
--
-- CREATE OR REPLACE FUNCTION overwrites whichever version is currently
-- live regardless of which file originally created it (several of these
-- were defined more than once across different migration files with
-- CREATE OR REPLACE, so only the latest-applied body was ever actually in
-- effect). Bodies are copied verbatim from their source files, unchanged
-- except for the search_path pin.
--
-- Idempotent: safe to run multiple times.

CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_customer_number()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    new_number TEXT;
    sequence_num INTEGER;
BEGIN
    SELECT COUNT(*) + 1 INTO sequence_num FROM public.customer_profiles;
    new_number := 'CUST-' || to_char(now(), 'YYYYMMDD') || '-' || LPAD(sequence_num::TEXT, 6, '0');
    RETURN new_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_guest_bookings_to_customer(
    p_customer_id UUID,
    p_email TEXT
)
RETURNS TABLE(linked_count INTEGER, linked_booking_ids TEXT[])
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_guest_bookings TEXT[];
    v_count INTEGER;
BEGIN
    SELECT ARRAY_AGG(id::TEXT)
    INTO v_guest_bookings
    FROM public.bookings
    WHERE email = LOWER(TRIM(p_email))
      AND customer_id IS NULL;

    v_count := COALESCE(ARRAY_LENGTH(v_guest_bookings, 1), 0);

    IF v_count > 0 THEN
        INSERT INTO public.guest_booking_links (guest_email, customer_id, booking_ids)
        VALUES (LOWER(TRIM(p_email)), p_customer_id, v_guest_bookings)
        ON CONFLICT (customer_id) DO UPDATE
        SET booking_ids = array_cat(guest_booking_links.booking_ids, v_guest_bookings),
            updated_at = now();
    END IF;

    RETURN QUERY SELECT v_count, v_guest_bookings;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_link_guest_bookings_on_profile_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    PERFORM public.link_guest_bookings_to_customer(NEW.id, NEW.email);
    RETURN NEW;
END;
$$;

-- Verification (run after applying):
--   SELECT proname, proconfig FROM pg_proc
--   WHERE proname IN ('trigger_set_timestamp', 'set_updated_at', 'generate_customer_number',
--     'link_guest_bookings_to_customer', 'auto_link_guest_bookings_on_profile_create')
--     AND pronamespace = 'public'::regnamespace;
--   -- proconfig should include {search_path=} for all five.
