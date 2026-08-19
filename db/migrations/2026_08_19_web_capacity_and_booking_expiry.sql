-- Marketplace Expansion, Stage 3: real seat-capacity enforcement for the main
-- web booking flow, plus expiry for unpaid bookings so a no-show doesn't
-- permanently hold a seat.
--
-- This is a companion to db/migrations/2026_08_10_whatsapp_customer_service.sql
-- (a separate, currently-uncommitted parallel effort) — it layers
-- CREATE OR REPLACE onto that migration's create_capacity_checked_booking()
-- function and adds new objects alongside route_departures, but never edits
-- that file or anything under lib/whatsapp/ / app/api/admin/whatsapp/.
-- Apply this AFTER 2026_08_10_whatsapp_customer_service.sql.
--
-- Idempotent: every statement is safe to run more than once.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'route_departures'
  ) THEN
    RAISE EXCEPTION 'route_departures is missing — apply 2026_08_10_whatsapp_customer_service.sql first';
  END IF;
END $$;

-- =========================================================================
-- 1. get_or_create_route_departure — race-safe "auto-publish on first
--    booking" for the web flow. The WhatsApp bot never needs this: it only
--    ever books against departures an admin has already published via its
--    own admin tool. The web flow has no such pre-publish step today (a
--    customer can freely pick any future date for a structured route) and
--    this preserves that UX while still getting a real, lockable capacity
--    row per (route_id, travel_date).
--
--    Deliberately refuses to touch a row that already exists but isn't
--    'published' (e.g. a 'draft' row from the WhatsApp admin tool) rather
--    than silently resurrecting it — that row may belong to someone else's
--    in-flight workflow.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_or_create_route_departure(
  p_route_id UUID, p_travel_date DATE, p_default_capacity INTEGER DEFAULT NULL
)
RETURNS TABLE(outcome TEXT, departure_id UUID, capacity INTEGER, reason TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_capacity INTEGER;
  v_route_capacity INTEGER;
  v_row public.route_departures%ROWTYPE;
BEGIN
  IF p_route_id IS NULL OR p_travel_date IS NULL OR p_travel_date < CURRENT_DATE THEN
    RETURN QUERY SELECT 'rejected'::TEXT, NULL::UUID, NULL::INTEGER, 'invalid_date'::TEXT;
    RETURN;
  END IF;

  -- A distinct lock namespace from create_capacity_checked_booking's
  -- 'booking-operation:' lock and claim_booking_dedupe's bare hashtext(key)
  -- — three independent lock domains now; keep them distinguishable.
  PERFORM pg_advisory_xact_lock(hashtext('route-departure:' || p_route_id::text || ':' || p_travel_date::text));

  SELECT r.capacity INTO v_route_capacity FROM public.routes r WHERE r.id = p_route_id;
  v_capacity := CASE
    WHEN v_route_capacity > 0 THEN v_route_capacity
    WHEN p_default_capacity > 0 THEN p_default_capacity
    ELSE 15
  END;

  -- Web-created rows never carry a departure_time (no time-of-day concept
  -- in the web flow) — this is the exact slot the existing unique index's
  -- COALESCE(departure_time, TIME '00:00') dedupes on.
  INSERT INTO public.route_departures (route_id, travel_date, departure_time, capacity, status)
  VALUES (p_route_id, p_travel_date, NULL, v_capacity, 'published')
  ON CONFLICT (route_id, travel_date, COALESCE(departure_time, TIME '00:00')) DO NOTHING;

  SELECT * INTO v_row FROM public.route_departures d
   WHERE d.route_id = p_route_id AND d.travel_date = p_travel_date AND d.departure_time IS NULL
   FOR UPDATE;

  IF v_row.status = 'published' THEN
    RETURN QUERY SELECT 'ready'::TEXT, v_row.id, v_row.capacity, NULL::TEXT;
  ELSE
    RETURN QUERY SELECT 'rejected'::TEXT, NULL::UUID, NULL::INTEGER, 'departure_unavailable'::TEXT;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_route_departure(UUID, DATE, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_route_departure(UUID, DATE, INTEGER) TO service_role;

-- =========================================================================
-- 2. create_capacity_checked_booking — CREATE OR REPLACE onto the function
--    2026_08_10_whatsapp_customer_service.sql defines, not a new function.
--    Same 12 original parameters, unchanged order; two additions:
--
--    - p_booking_source, defaulted to the function's existing hardcoded
--      literal ('whatsapp') so the existing WhatsApp call site — which
--      passes named params and knows nothing about this new one — is
--      byte-for-byte unaffected. The web caller passes 'web'.
--    - The reserved-seats query now also excludes a booking whose
--      booking_fee_status isn't 'paid' and whose booking_expires_at has
--      already passed, regardless of its stored status. This makes
--      capacity correctness never depend on the expiry cron having run —
--      a lapsed hold stops counting the instant it lapses. Benefits the
--      existing WhatsApp caller for free, since it's the same function.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.create_capacity_checked_booking(
  p_operation_key TEXT, p_booking_id TEXT, p_trip_id TEXT, p_departure_id UUID,
  p_name TEXT, p_phone TEXT, p_email TEXT, p_student_id TEXT, p_seats INTEGER,
  p_destination TEXT, p_pickup TEXT, p_location TEXT,
  p_booking_type TEXT DEFAULT 'WhatsApp',
  p_booking_source TEXT DEFAULT 'whatsapp'
)
RETURNS TABLE(outcome TEXT, booking_id TEXT, reason TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_departure public.route_departures%ROWTYPE;
  v_route public.routes%ROWTYPE;
  v_reserved INTEGER;
  v_fee BIGINT;
  v_existing TEXT;
BEGIN
  IF p_operation_key IS NULL OR btrim(p_operation_key) = ''
     OR p_booking_id IS NULL OR btrim(p_booking_id) = '' THEN
    RETURN QUERY SELECT 'rejected'::TEXT, NULL::TEXT, 'invalid_operation'::TEXT; RETURN;
  END IF;
  IF p_seats IS NULL OR p_seats < 1 OR p_seats > 10 THEN
    RETURN QUERY SELECT 'rejected'::TEXT, NULL::TEXT, 'invalid_seats'::TEXT; RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('booking-operation:' || p_operation_key));
  SELECT b.booking_id INTO v_existing
    FROM public.bookings b WHERE b.source_operation_key = p_operation_key;
  IF FOUND THEN RETURN QUERY SELECT 'existing'::TEXT, v_existing, NULL::TEXT; RETURN; END IF;

  SELECT * INTO v_departure
    FROM public.route_departures d WHERE d.id = p_departure_id FOR UPDATE;
  IF NOT FOUND OR v_departure.status <> 'published' OR v_departure.travel_date < CURRENT_DATE THEN
    RETURN QUERY SELECT 'rejected'::TEXT, NULL::TEXT, 'departure_unavailable'::TEXT; RETURN;
  END IF;

  SELECT * INTO v_route FROM public.routes r WHERE r.id = v_departure.route_id FOR SHARE;
  IF NOT FOUND OR v_route.status <> 'active' OR v_route.fare <= 0 THEN
    RETURN QUERY SELECT 'rejected'::TEXT, NULL::TEXT, 'route_unavailable'::TEXT; RETURN;
  END IF;

  SELECT COALESCE(sum(b.seats), 0)::INTEGER INTO v_reserved
    FROM public.bookings b
   WHERE b.departure_id = v_departure.id
     AND lower(COALESCE(b.status, 'booked')) NOT IN ('cancelled', 'expired')
     AND NOT (
       COALESCE(b.booking_fee_status, 'unpaid') <> 'paid'
       AND b.booking_expires_at IS NOT NULL
       AND b.booking_expires_at < now()
     );
  IF v_reserved + p_seats > v_departure.capacity THEN
    RETURN QUERY SELECT 'rejected'::TEXT, NULL::TEXT, 'insufficient_seats'::TEXT; RETURN;
  END IF;

  SELECT COALESCE(s.booking_fee, 0)::BIGINT INTO v_fee
    FROM public.settings s ORDER BY s.updated_at DESC LIMIT 1;

  INSERT INTO public.bookings (
    booking_id, trip_id, departure_id, route_id, university_id,
    name, phone, email, student_id, seats, destination, travel_date,
    pickup, location, booking_type, status, payment_status, fare,
    booking_fee_amount, booking_fee_status, fare_status, booking_expires_at,
    booking_source, source_operation_key
  ) VALUES (
    p_booking_id, p_trip_id, v_departure.id, v_route.id, v_route.university_id,
    btrim(p_name), btrim(p_phone), NULLIF(btrim(p_email), ''),
    COALESCE(btrim(p_student_id), ''), p_seats, btrim(p_destination),
    v_departure.travel_date, btrim(p_pickup), btrim(p_location),
    COALESCE(NULLIF(btrim(p_booking_type), ''), 'WhatsApp'),
    'Booked', 'Pending', v_route.fare, v_fee, 'unpaid', 'unpaid',
    now() + interval '48 hours',
    COALESCE(NULLIF(btrim(p_booking_source), ''), 'whatsapp'), p_operation_key
  );

  RETURN QUERY SELECT 'created'::TEXT, p_booking_id, NULL::TEXT;
EXCEPTION WHEN unique_violation THEN
  SELECT b.booking_id INTO v_existing
    FROM public.bookings b WHERE b.source_operation_key = p_operation_key;
  IF FOUND THEN RETURN QUERY SELECT 'existing'::TEXT, v_existing, NULL::TEXT;
  ELSE RETURN QUERY SELECT 'rejected'::TEXT, NULL::TEXT, 'identifier_conflict'::TEXT; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_capacity_checked_booking(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_capacity_checked_booking(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- =========================================================================
-- 3. expire_overdue_bookings — the cron sweep target. Flips a lapsed,
--    still-unpaid Booked/Confirmed booking to 'Expired' for admin
--    visibility/reporting. NOT load-bearing for capacity correctness —
--    create_capacity_checked_booking's own reserved-seats query (above)
--    already excludes a lapsed booking regardless of whether this has run,
--    so a slow/down cron never allows overselling.
--
--    The status IN ('Booked','Confirmed') guard intentionally mirrors the
--    ALLOWED_TRANSITIONS entries added to lib/bookingLifecycle.ts alongside
--    this migration — the two are meant to stay in lockstep; if one changes
--    which states can expire, update the other.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.expire_overdue_bookings()
RETURNS TABLE(expired_count BIGINT)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH updated AS (
    UPDATE public.bookings b
       SET status = 'Expired'
     WHERE b.status IN ('Booked', 'Confirmed')
       AND COALESCE(b.booking_fee_status, 'unpaid') <> 'paid'
       AND b.booking_expires_at IS NOT NULL
       AND b.booking_expires_at < now()
    RETURNING 1
  )
  SELECT count(*) FROM updated;
$$;

REVOKE ALL ON FUNCTION public.expire_overdue_bookings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_overdue_bookings() TO service_role;

-- =========================================================================
-- 4. Index to keep the sweep (and any admin "unpaid & overdue" query) cheap
--    as bookings grows, matching expire_overdue_bookings()'s own WHERE shape.
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_bookings_expiry_sweep
  ON public.bookings (booking_expires_at)
  WHERE status IN ('Booked', 'Confirmed') AND booking_fee_status <> 'paid';

-- Verification (run after applying):
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('create_capacity_checked_booking', 'get_or_create_route_departure', 'expire_overdue_bookings');
--   -- expect all three.
--   SELECT * FROM public.get_or_create_route_departure('<a real route id>', CURRENT_DATE + 1, 15);
--   SELECT * FROM public.get_or_create_route_departure('<same route id>', CURRENT_DATE + 1, 15);
--   -- second call returns the SAME departure_id as the first (outcome='ready' both times).
--   SELECT * FROM public.expire_overdue_bookings();
--   -- returns a row with expired_count (0 is fine on a fresh apply).
