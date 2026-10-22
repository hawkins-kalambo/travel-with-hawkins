-- Customer contact book + admin-written customer messages (SMS / email).
--
-- STATUS: NOT APPLIED. Additive only. Review and exercise against isolated
-- staging first. Depends on:
--   customer_authentication_system.sql            (bookings.customer_id)
--   2026_08_10_whatsapp_customer_service.sql      (bookings.booking_source)
--   communication_center_migration.sql            (public.set_updated_at)
--
-- What it does:
--   1. customer_contacts  - one row per customer phone number. Filled by a
--      trigger on bookings, so every booking path (website form, WhatsApp
--      RPCs, admin-created) lands here without any app code having to
--      remember to do it. Backfilled from every existing booking.
--   2. customer_messages / customer_message_recipients  - a log of every
--      message an admin sends from Communication -> Customer Messages, with
--      each recipient's per-channel delivery outcome.
--
-- Contacts are keyed by normalized phone (+265XXXXXXXXX) because every booking
-- has a phone and many guest bookings have no email or account.

BEGIN;

-- Mirrors lib/phoneNumbers.ts normalizeMalawiPhone(), plus WhatsApp's bare
-- "265XXXXXXXXX" wa_id form. Anything unrecognised is kept as "+<digits>" so a
-- foreign number still gets one stable row instead of being dropped.
CREATE OR REPLACE FUNCTION public.normalize_contact_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits TEXT := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
BEGIN
  IF digits ~ '^265[89]\d{8}$' THEN RETURN '+' || digits; END IF;
  IF digits ~ '^0[89]\d{8}$' THEN RETURN '+265' || substr(digits, 2); END IF;
  IF digits ~ '^[89]\d{8}$' THEN RETURN '+265' || digits; END IF;
  IF length(digits) >= 9 THEN RETURN '+' || digits; END IF;
  RETURN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  first_source TEXT,
  last_source TEXT,
  first_booking_id TEXT,
  last_booking_id TEXT,
  last_destination TEXT,
  booking_count INTEGER NOT NULL DEFAULT 0,
  first_booked_at TIMESTAMPTZ,
  last_booked_at TIMESTAMPTZ,
  sms_opt_out BOOLEAN NOT NULL DEFAULT false,
  email_opt_out BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_last_booked ON public.customer_contacts (last_booked_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_email ON public.customer_contacts (lower(email));

DROP TRIGGER IF EXISTS set_customer_contacts_updated_at ON public.customer_contacts;
CREATE TRIGGER set_customer_contacts_updated_at
BEFORE UPDATE ON public.customer_contacts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Latest booking wins for name/email/destination, but a blank value on the
-- new booking never wipes a good one already on file. Opt-out flags are
-- never touched here -- only an admin changes those.
CREATE OR REPLACE FUNCTION public.capture_customer_contact_from_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone TEXT := public.normalize_contact_phone(NEW.phone);
  v_name TEXT := nullif(btrim(coalesce(NEW.name, '')), '');
  v_email TEXT := nullif(lower(btrim(coalesce(NEW.email, ''))), '');
  v_booked_at TIMESTAMPTZ := coalesce(NEW.created_at, now());
BEGIN
  IF v_phone IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_email IS NOT NULL AND position('@' IN v_email) = 0 THEN
    v_email := NULL;
  END IF;

  INSERT INTO public.customer_contacts AS c (
    phone, name, email, customer_id, first_source, last_source,
    first_booking_id, last_booking_id, last_destination, booking_count,
    first_booked_at, last_booked_at
  ) VALUES (
    v_phone, v_name, v_email, NEW.customer_id, NEW.booking_source, NEW.booking_source,
    NEW.booking_id, NEW.booking_id, NEW.destination, 1,
    v_booked_at, v_booked_at
  )
  ON CONFLICT (phone) DO UPDATE SET
    name = coalesce(EXCLUDED.name, c.name),
    email = coalesce(EXCLUDED.email, c.email),
    customer_id = coalesce(EXCLUDED.customer_id, c.customer_id),
    last_source = coalesce(EXCLUDED.last_source, c.last_source),
    last_booking_id = EXCLUDED.last_booking_id,
    last_destination = coalesce(EXCLUDED.last_destination, c.last_destination),
    booking_count = c.booking_count + 1,
    last_booked_at = greatest(c.last_booked_at, EXCLUDED.last_booked_at);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Capturing a contact is secondary to the booking itself: never let it
  -- roll back a customer's booking.
  RAISE WARNING 'capture_customer_contact_from_booking failed for booking %: %', NEW.booking_id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_capture_customer_contact ON public.bookings;
CREATE TRIGGER trg_bookings_capture_customer_contact
AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.capture_customer_contact_from_booking();

-- Backfill: one row per normalized phone, latest booking's details winning.
INSERT INTO public.customer_contacts (
  phone, name, email, customer_id, first_source, last_source,
  first_booking_id, last_booking_id, last_destination, booking_count,
  first_booked_at, last_booked_at
)
SELECT
  b.norm_phone,
  (array_agg(nullif(btrim(b.name), '') ORDER BY b.created_at DESC) FILTER (WHERE nullif(btrim(b.name), '') IS NOT NULL))[1],
  (array_agg(lower(btrim(b.email)) ORDER BY b.created_at DESC) FILTER (WHERE b.email LIKE '%@%'))[1],
  (array_agg(b.customer_id ORDER BY b.created_at DESC) FILTER (WHERE b.customer_id IS NOT NULL))[1],
  (array_agg(b.booking_source ORDER BY b.created_at ASC))[1],
  (array_agg(b.booking_source ORDER BY b.created_at DESC))[1],
  (array_agg(b.booking_id ORDER BY b.created_at ASC))[1],
  (array_agg(b.booking_id ORDER BY b.created_at DESC))[1],
  (array_agg(b.destination ORDER BY b.created_at DESC) FILTER (WHERE b.destination IS NOT NULL))[1],
  count(*),
  min(b.created_at),
  max(b.created_at)
FROM (
  SELECT bk.*, public.normalize_contact_phone(bk.phone) AS norm_phone
  FROM public.bookings bk
) b
WHERE b.norm_phone IS NOT NULL
GROUP BY b.norm_phone
ON CONFLICT (phone) DO NOTHING;

-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT,
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  channels TEXT[] NOT NULL CHECK (channels <@ ARRAY['sms', 'email']::TEXT[] AND cardinality(channels) > 0),
  audience TEXT NOT NULL CHECK (audience IN ('all', 'selected')),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sms_sent INTEGER NOT NULL DEFAULT 0,
  sms_failed INTEGER NOT NULL DEFAULT 0,
  sms_skipped INTEGER NOT NULL DEFAULT 0,
  email_sent INTEGER NOT NULL DEFAULT 0,
  email_failed INTEGER NOT NULL DEFAULT 0,
  email_skipped INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'partial', 'failed')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_customer_messages_created ON public.customer_messages (created_at DESC);

CREATE TABLE IF NOT EXISTS public.customer_message_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.customer_messages(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.customer_contacts(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  email TEXT,
  sms_status TEXT CHECK (sms_status IS NULL OR sms_status IN ('sent', 'failed', 'skipped')),
  sms_provider_status TEXT,
  sms_message_id TEXT,
  email_status TEXT CHECK (email_status IS NULL OR email_status IN ('sent', 'failed', 'skipped')),
  email_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_message_recipients_message ON public.customer_message_recipients (message_id);
CREATE INDEX IF NOT EXISTS idx_customer_message_recipients_contact ON public.customer_message_recipients (contact_id);

-- Service-role only: every read/write goes through admin-gated API routes.
ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_message_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_contacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.customer_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.customer_message_recipients FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capture_customer_contact_from_booking() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Staging verification:
--   SELECT count(*) AS contacts, sum(booking_count) AS bookings_covered FROM public.customer_contacts;
--   SELECT count(DISTINCT public.normalize_contact_phone(phone)) FROM public.bookings;  -- should equal contacts
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.bookings'::regclass AND NOT tgisinternal;
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('customer_contacts', 'customer_messages', 'customer_message_recipients');
