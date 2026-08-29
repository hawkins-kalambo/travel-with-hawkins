-- WhatsApp: booking before a trip is created (master plan §A / Stage 2.1).
--
-- STATUS: NOT APPLIED. Additive. Review and exercise against isolated staging
-- before production. Depends on 2026_08_29_whatsapp_pilot_booking_rules.sql
-- (and its prerequisites) already being applied.
--
-- What it does:
--   1. bookings.assigned_at / assigned_by  - audit of a later transport
--      assignment. An "unassigned" WhatsApp booking is one with
--      booking_source = 'whatsapp' AND departure_id IS NULL.
--   2. create_route_booking_no_departure()  - creates a real booking against a
--      supported structured route + a customer-chosen future travel_date, with
--      NO route_departures link. Same fee/deadline/unpaid-limit rules as
--      create_capacity_checked_booking(); NO per-departure capacity check
--      (there is no departure). Deadline is anchored to 23:59 Malawi on the
--      requested date. A route with fare <= 0 is rejected as 'route_unpriced'
--      (the bot flags it for an agent; it never guesses an amount).
--   3. assign_whatsapp_booking()  - atomically links an unassigned booking to a
--      published route_departures row: locks both, validates route + date +
--      published state + capacity, refuses if already assigned, and preserves
--      the booking reference, payments and requested date.
--
-- Expiry already covers unassigned bookings: expire_whatsapp_reservations()
-- filters on booking_source/fee/status/deadline only, and capacity is computed
-- per departure, so cancelling an unassigned booking releases nothing.

BEGIN;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_whatsapp_unassigned
  ON public.bookings (route_id, travel_date)
  WHERE booking_source = 'whatsapp' AND departure_id IS NULL;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_route_booking_no_departure(
  p_operation_key TEXT, p_booking_id TEXT, p_trip_id TEXT, p_route_id UUID,
  p_travel_date DATE, p_name TEXT, p_phone TEXT, p_email TEXT, p_student_id TEXT,
  p_destination TEXT, p_pickup TEXT, p_location TEXT,
  p_booking_type TEXT DEFAULT 'WhatsApp',
  p_whatsapp_contact_id UUID DEFAULT NULL,
  p_policy_version TEXT DEFAULT 'wa-pilot-1'
)
RETURNS TABLE(outcome TEXT, booking_id TEXT, reason TEXT,
              expires_at TIMESTAMPTZ, fare BIGINT, booking_fee BIGINT)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_route public.routes%ROWTYPE;
  v_existing public.bookings%ROWTYPE;
  v_unpaid INTEGER;
  v_fee BIGINT;
  v_travel_ts TIMESTAMPTZ;
  v_expires TIMESTAMPTZ;
BEGIN
  IF p_operation_key IS NULL OR btrim(p_operation_key) = ''
     OR p_booking_id IS NULL OR btrim(p_booking_id) = '' THEN
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'invalid_operation', NULL::TIMESTAMPTZ, NULL::BIGINT, NULL::BIGINT; RETURN;
  END IF;
  IF p_travel_date IS NULL OR p_travel_date < CURRENT_DATE THEN
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'date_in_past', NULL::TIMESTAMPTZ, NULL::BIGINT, NULL::BIGINT; RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('booking-operation:' || p_operation_key));

  SELECT * INTO v_existing FROM public.bookings b WHERE b.source_operation_key = p_operation_key;
  IF FOUND THEN
    RETURN QUERY SELECT 'existing', v_existing.booking_id, NULL::TEXT,
                        v_existing.booking_expires_at, v_existing.fare, v_existing.booking_fee_amount;
    RETURN;
  END IF;

  SELECT * INTO v_route FROM public.routes r WHERE r.id = p_route_id FOR SHARE;
  IF NOT FOUND OR v_route.status <> 'active' THEN
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'route_unavailable', NULL::TIMESTAMPTZ, NULL::BIGINT, NULL::BIGINT; RETURN;
  END IF;
  IF v_route.fare IS NULL OR v_route.fare <= 0 THEN
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'route_unpriced', NULL::TIMESTAMPTZ, NULL::BIGINT, NULL::BIGINT; RETURN;
  END IF;

  v_travel_ts := (p_travel_date + TIME '23:59:59') AT TIME ZONE 'Africa/Blantyre';
  IF v_travel_ts - now() < interval '24 hours' THEN
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'departure_too_soon', NULL::TIMESTAMPTZ, NULL::BIGINT, NULL::BIGINT; RETURN;
  END IF;

  -- R08: same unpaid-reservation cap as the scheduled path; unassigned
  -- bookings count. Fee-paid (R09) and cancelled/completed (R10) do not.
  IF p_whatsapp_contact_id IS NOT NULL THEN
    SELECT count(*) INTO v_unpaid
      FROM public.bookings b
     WHERE b.whatsapp_contact_id = p_whatsapp_contact_id
       AND b.booking_fee_status <> 'paid'
       AND lower(COALESCE(b.status, 'booked')) NOT IN ('cancelled', 'completed');
    IF v_unpaid >= 3 THEN
      RETURN QUERY SELECT 'rejected', NULL::TEXT, 'unpaid_limit_reached', NULL::TIMESTAMPTZ, NULL::BIGINT, NULL::BIGINT; RETURN;
    END IF;
  END IF;

  IF v_travel_ts - now() >= interval '7 days' THEN
    v_expires := LEAST(now() + interval '7 days', v_travel_ts - interval '24 hours');
  ELSE
    v_expires := now() + interval '15 minutes';
  END IF;

  SELECT COALESCE(s.booking_fee, 0)::BIGINT INTO v_fee
    FROM public.settings s ORDER BY s.updated_at DESC LIMIT 1;

  INSERT INTO public.bookings (
    booking_id, trip_id, departure_id, route_id, university_id,
    name, phone, email, student_id, seats, destination, travel_date,
    pickup, location, booking_type, status, payment_status, fare,
    booking_fee_amount, booking_fee_status, fare_status, booking_expires_at,
    booking_source, source_operation_key, whatsapp_contact_id, policy_version
  ) VALUES (
    p_booking_id, p_trip_id, NULL, v_route.id, v_route.university_id,
    btrim(p_name), btrim(p_phone), NULLIF(btrim(p_email), ''),
    COALESCE(btrim(p_student_id), ''), 1, btrim(p_destination),
    p_travel_date, btrim(p_pickup), btrim(p_location),
    COALESCE(NULLIF(btrim(p_booking_type), ''), 'WhatsApp'),
    'Booked', 'Pending', v_route.fare, v_fee, 'unpaid', 'unpaid',
    v_expires, 'whatsapp', p_operation_key, p_whatsapp_contact_id,
    COALESCE(NULLIF(btrim(p_policy_version), ''), 'wa-pilot-1')
  );

  RETURN QUERY SELECT 'created', p_booking_id, NULL::TEXT, v_expires, v_route.fare, v_fee;

EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_existing FROM public.bookings b WHERE b.source_operation_key = p_operation_key;
  IF FOUND THEN
    RETURN QUERY SELECT 'existing', v_existing.booking_id, NULL::TEXT,
                        v_existing.booking_expires_at, v_existing.fare, v_existing.booking_fee_amount;
  ELSE
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'identifier_conflict', NULL::TIMESTAMPTZ, NULL::BIGINT, NULL::BIGINT;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_route_booking_no_departure(
  TEXT, TEXT, TEXT, UUID, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_route_booking_no_departure(
  TEXT, TEXT, TEXT, UUID, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT)
  TO service_role;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_whatsapp_booking(
  p_booking_id TEXT, p_departure_id UUID, p_actor UUID DEFAULT NULL
)
RETURNS TABLE(outcome TEXT, reason TEXT)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_departure public.route_departures%ROWTYPE;
  v_reserved INTEGER;
BEGIN
  SELECT * INTO v_booking FROM public.bookings b WHERE b.booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'rejected', 'booking_not_found'; RETURN; END IF;
  IF v_booking.booking_source <> 'whatsapp' THEN RETURN QUERY SELECT 'rejected', 'not_whatsapp_booking'; RETURN; END IF;
  IF v_booking.departure_id IS NOT NULL THEN RETURN QUERY SELECT 'rejected', 'already_assigned'; RETURN; END IF;
  IF lower(COALESCE(v_booking.status, 'booked')) NOT IN ('booked', 'confirmed') THEN
    RETURN QUERY SELECT 'rejected', 'booking_not_active'; RETURN;
  END IF;

  SELECT * INTO v_departure FROM public.route_departures d WHERE d.id = p_departure_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'rejected', 'departure_not_found'; RETURN; END IF;
  IF v_departure.status <> 'published' THEN RETURN QUERY SELECT 'rejected', 'departure_not_bookable'; RETURN; END IF;
  IF v_departure.route_id <> v_booking.route_id THEN RETURN QUERY SELECT 'rejected', 'route_mismatch'; RETURN; END IF;
  IF v_departure.travel_date <> v_booking.travel_date THEN RETURN QUERY SELECT 'rejected', 'date_mismatch'; RETURN; END IF;

  SELECT COALESCE(sum(b.seats), 0)::INTEGER INTO v_reserved
    FROM public.bookings b
   WHERE b.departure_id = v_departure.id
     AND lower(COALESCE(b.status, 'booked')) NOT IN ('cancelled', 'expired');
  IF v_reserved + COALESCE(v_booking.seats, 1) > v_departure.capacity THEN
    RETURN QUERY SELECT 'rejected', 'insufficient_seats'; RETURN;
  END IF;

  UPDATE public.bookings
     SET departure_id = v_departure.id, assigned_at = now(), assigned_by = p_actor
   WHERE booking_id = p_booking_id;

  RETURN QUERY SELECT 'assigned', NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_whatsapp_booking(TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_whatsapp_booking(TEXT, UUID, UUID) TO service_role;

COMMIT;

-- Staging verification:
--   SELECT proname, pronargs FROM pg_proc
--   WHERE proname IN ('create_route_booking_no_departure','assign_whatsapp_booking');
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'bookings' AND column_name IN ('assigned_at','assigned_by');
