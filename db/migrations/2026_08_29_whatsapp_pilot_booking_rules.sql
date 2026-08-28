-- WhatsApp pilot booking rules (master plan P2).
--
-- STATUS: NOT APPLIED. Additive. Review and exercise against isolated staging
-- before production. Depends on 2026_08_10_whatsapp_customer_service.sql and
-- 2026_08_07_manual_fare_and_receipt_delivery.sql already being applied.
--
-- What it does:
--   1. bookings.whatsapp_contact_id  - secure link from a booking to the
--      WhatsApp contact that created it (master plan §4/§3.2: an entered phone
--      number is NOT proof of ownership; this link is set only by the RPC).
--   2. bookings.policy_version       - snapshot of the rule set applied.
--   3. create_capacity_checked_booking() rewritten to enforce, atomically:
--        - one passenger / one seat (R02)
--        - booking-fee deadline: 7 days out -> now()+7d capped at departure-24h
--          (R05); < 7 days out -> now()+15min short-notice hold (R07/D01)
--        - departures within 24h are not bookable (D02)
--        - max 3 active unpaid reservations per WhatsApp contact (R08; no
--          admin override in the pilot - D05)
--      Fare/fee are still read inside the transaction; no caller-supplied money.
--   4. expire_whatsapp_reservations() - releases seats for WhatsApp reservations
--      whose fee is unpaid past the deadline, by moving Booked -> Cancelled
--      (a valid journey transition; capacity is computed and excludes cancelled).
--      Intended caller: a CRON_SECRET-gated Vercel Cron route (every ~10 min).
--      Deadlines are ALSO enforced inline at creation, so a missed run cannot
--      create an unbounded valid hold.

BEGIN;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS whatsapp_contact_id UUID REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS policy_version TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_whatsapp_contact
  ON public.bookings (whatsapp_contact_id)
  WHERE whatsapp_contact_id IS NOT NULL;

-- Return type changes, so the old signature must be dropped first.
DROP FUNCTION IF EXISTS public.create_capacity_checked_booking(
  TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_capacity_checked_booking(
  p_operation_key TEXT, p_booking_id TEXT, p_trip_id TEXT, p_departure_id UUID,
  p_name TEXT, p_phone TEXT, p_email TEXT, p_student_id TEXT, p_seats INTEGER,
  p_destination TEXT, p_pickup TEXT, p_location TEXT,
  p_booking_type TEXT DEFAULT 'WhatsApp',
  p_whatsapp_contact_id UUID DEFAULT NULL,
  p_policy_version TEXT DEFAULT 'wa-pilot-1'
)
RETURNS TABLE(outcome TEXT, booking_id TEXT, reason TEXT,
              expires_at TIMESTAMPTZ, fare BIGINT, booking_fee BIGINT)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_departure public.route_departures%ROWTYPE;
  v_route public.routes%ROWTYPE;
  v_existing public.bookings%ROWTYPE;
  v_reserved INTEGER;
  v_unpaid INTEGER;
  v_fee BIGINT;
  v_departure_ts TIMESTAMPTZ;
  v_expires TIMESTAMPTZ;
BEGIN
  IF p_operation_key IS NULL OR btrim(p_operation_key) = ''
     OR p_booking_id IS NULL OR btrim(p_booking_id) = '' THEN
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'invalid_operation', NULL::TIMESTAMPTZ, NULL::BIGINT, NULL::BIGINT; RETURN;
  END IF;
  IF p_seats IS DISTINCT FROM 1 THEN
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'invalid_seats', NULL::TIMESTAMPTZ, NULL::BIGINT, NULL::BIGINT; RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('booking-operation:' || p_operation_key));

  SELECT * INTO v_existing FROM public.bookings b WHERE b.source_operation_key = p_operation_key;
  IF FOUND THEN
    RETURN QUERY SELECT 'existing', v_existing.booking_id, NULL::TEXT,
                        v_existing.booking_expires_at, v_existing.fare, v_existing.booking_fee_amount;
    RETURN;
  END IF;

  SELECT * INTO v_departure FROM public.route_departures d WHERE d.id = p_departure_id FOR UPDATE;
  IF NOT FOUND OR v_departure.status <> 'published' OR v_departure.travel_date < CURRENT_DATE THEN
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'departure_unavailable', NULL::TIMESTAMPTZ, NULL::BIGINT, NULL::BIGINT; RETURN;
  END IF;

  v_departure_ts := (v_departure.travel_date + COALESCE(v_departure.departure_time, TIME '12:00:00')) AT TIME ZONE 'Africa/Blantyre';
  IF v_departure_ts - now() < interval '24 hours' THEN
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'departure_too_soon', NULL::TIMESTAMPTZ, NULL::BIGINT, NULL::BIGINT; RETURN;
  END IF;

  SELECT * INTO v_route FROM public.routes r WHERE r.id = v_departure.route_id FOR SHARE;
  IF NOT FOUND OR v_route.status <> 'active' OR v_route.fare <= 0 THEN
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'route_unavailable', NULL::TIMESTAMPTZ, NULL::BIGINT, NULL::BIGINT; RETURN;
  END IF;

  -- R08: at most three active unpaid reservations per WhatsApp contact.
  -- Fee paid (even with fare outstanding) does not count (R09); cancelled and
  -- completed do not count (R10). Checked under the advisory lock so parallel
  -- requests cannot both slip past.
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

  SELECT COALESCE(sum(b.seats), 0)::INTEGER INTO v_reserved
    FROM public.bookings b
   WHERE b.departure_id = v_departure.id
     AND lower(COALESCE(b.status, 'booked')) NOT IN ('cancelled', 'expired');
  IF v_reserved + 1 > v_departure.capacity THEN
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'insufficient_seats', NULL::TIMESTAMPTZ, NULL::BIGINT, NULL::BIGINT; RETURN;
  END IF;

  -- R05 / R07 / D02 deadline.
  IF v_departure_ts - now() >= interval '7 days' THEN
    v_expires := LEAST(now() + interval '7 days', v_departure_ts - interval '24 hours');
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
    p_booking_id, p_trip_id, v_departure.id, v_route.id, v_route.university_id,
    btrim(p_name), btrim(p_phone), NULLIF(btrim(p_email), ''),
    COALESCE(btrim(p_student_id), ''), 1, btrim(p_destination),
    v_departure.travel_date, btrim(p_pickup), btrim(p_location),
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

REVOKE ALL ON FUNCTION public.create_capacity_checked_booking(
  TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_capacity_checked_booking(
  TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, UUID, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.expire_whatsapp_reservations()
RETURNS TABLE(booking_id TEXT)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  UPDATE public.bookings b
     SET status = 'Cancelled',
         cancellation_reason = COALESCE(b.cancellation_reason,
           'Auto-cancelled: booking fee not paid before the deadline'),
         updated_at = now()
   WHERE b.booking_source = 'whatsapp'
     AND b.booking_fee_status = 'unpaid'
     AND lower(COALESCE(b.status, 'booked')) = 'booked'
     AND b.booking_expires_at IS NOT NULL
     AND b.booking_expires_at < now()
  RETURNING b.booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_whatsapp_reservations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_whatsapp_reservations() TO service_role;

COMMIT;

-- Staging verification:
--   SELECT proname, pronargs FROM pg_proc WHERE proname = 'create_capacity_checked_booking';
--     -> exactly one row, pronargs = 15
--   SELECT * FROM public.expire_whatsapp_reservations();
--     -> booking_ids of reservations past their deadline (none on a clean run)
--   Column check:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'bookings' AND column_name IN ('whatsapp_contact_id','policy_version');
