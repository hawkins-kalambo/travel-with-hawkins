-- Secure WhatsApp customer-service foundation.
-- Additive only. Review and exercise against staging; do not apply directly
-- to production.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.route_departures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
    travel_date DATE NOT NULL,
    departure_time TIME,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'closed', 'cancelled', 'completed')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_route_departures_search
    ON public.route_departures (route_id, travel_date, status);
CREATE UNIQUE INDEX IF NOT EXISTS route_departures_unique_slot
    ON public.route_departures (route_id, travel_date, COALESCE(departure_time, TIME '00:00'));

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS departure_id UUID REFERENCES public.route_departures(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS booking_source TEXT NOT NULL DEFAULT 'web',
    ADD COLUMN IF NOT EXISTS source_operation_key TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_departure_id ON public.bookings (departure_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_source_operation_key
    ON public.bookings (source_operation_key) WHERE source_operation_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wa_id TEXT NOT NULL UNIQUE CHECK (wa_id ~ '^\+[1-9][0-9]{7,14}$'),
    display_name TEXT,
    customer_id UUID REFERENCES public.customer_profiles(id) ON DELETE SET NULL,
    language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'ny')),
    consent_status TEXT NOT NULL DEFAULT 'implicit_service'
        CHECK (consent_status IN ('implicit_service', 'explicit', 'opted_out')),
    consent_source TEXT,
    consent_recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    opted_out_at TIMESTAMPTZ,
    last_inbound_at TIMESTAMPTZ,
    service_window_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((consent_status = 'opted_out') = (opted_out_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_customer ON public.whatsapp_contacts (customer_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_service_window ON public.whatsapp_contacts (service_window_expires_at);

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
    conversation_id UUID PRIMARY KEY REFERENCES public.communication_conversations(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.whatsapp_contacts(id) ON DELETE RESTRICT,
    mode TEXT NOT NULL DEFAULT 'bot' CHECK (mode IN ('bot', 'human')),
    status TEXT NOT NULL DEFAULT 'bot_controlled'
        CHECK (status IN ('bot_controlled', 'waiting', 'human_controlled', 'resolved')),
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    state_step TEXT NOT NULL DEFAULT 'language',
    state_data JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(state_data) = 'object'),
    state_version BIGINT NOT NULL DEFAULT 0 CHECK (state_version >= 0),
    state_expires_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (contact_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_queue
    ON public.whatsapp_conversations (status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_assignee
    ON public.whatsapp_conversations (assigned_to, status);

ALTER TABLE public.communication_messages
    ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'in_app',
    ADD COLUMN IF NOT EXISTS direction TEXT,
    ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'customer'
        CHECK (visibility IN ('customer', 'internal')),
    ADD COLUMN IF NOT EXISTS message_kind TEXT NOT NULL DEFAULT 'text',
    ADD COLUMN IF NOT EXISTS external_sender_id UUID REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
    ADD COLUMN IF NOT EXISTS provider_status TEXT,
    ADD COLUMN IF NOT EXISTS provider_error_code TEXT,
    ADD COLUMN IF NOT EXISTS template_name TEXT,
    ADD COLUMN IF NOT EXISTS provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_communication_messages_provider_id
    ON public.communication_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communication_messages_whatsapp_transcript
    ON public.communication_messages (conversation_id, created_at) WHERE channel = 'whatsapp';

CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL UNIQUE,
    provider_message_id TEXT,
    event_kind TEXT NOT NULL CHECK (event_kind IN ('message', 'status', 'unknown')),
    processing_status TEXT NOT NULL DEFAULT 'received'
        CHECK (processing_status IN ('received', 'processing', 'processed', 'failed')),
    processing_attempts INTEGER NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
    correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(event_data) = 'object'),
    processing_started_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    last_error_code TEXT CHECK (last_error_code IS NULL OR length(last_error_code) <= 120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
      (processing_status = 'processed' AND processed_at IS NOT NULL)
      OR (processing_status <> 'processed' AND processed_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_recovery
    ON public.whatsapp_webhook_events (processing_status, created_at);

CREATE TABLE IF NOT EXISTS public.whatsapp_internal_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.communication_conversations(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_internal_notes_conversation
    ON public.whatsapp_internal_notes (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.whatsapp_booking_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_key TEXT NOT NULL UNIQUE,
    conversation_id UUID NOT NULL REFERENCES public.communication_conversations(id) ON DELETE RESTRICT,
    booking_id TEXT REFERENCES public.bookings(booking_id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'completed', 'failed')),
    last_error_code TEXT CHECK (last_error_code IS NULL OR length(last_error_code) <= 120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_booking_operations_conversation
    ON public.whatsapp_booking_operations (conversation_id, created_at DESC);

ALTER TABLE public.route_departures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_booking_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_internal_notes_admin ON public.whatsapp_internal_notes;
CREATE POLICY whatsapp_internal_notes_admin ON public.whatsapp_internal_notes
FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
)
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
);

CREATE OR REPLACE FUNCTION public.claim_whatsapp_webhook_event(p_event_id UUID)
RETURNS TABLE(event_id UUID, correlation_id UUID, event_data JSONB)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  UPDATE public.whatsapp_webhook_events e
     SET processing_status = 'processing', processing_started_at = now(),
         processing_attempts = e.processing_attempts + 1,
         last_error_code = NULL, updated_at = now()
   WHERE e.id = p_event_id AND e.processing_status IN ('received', 'failed')
  RETURNING e.id, e.correlation_id, e.event_data;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_webhook_event(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_webhook_event(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.transition_whatsapp_state(
  p_conversation_id UUID, p_expected_version BIGINT, p_step TEXT,
  p_state_data JSONB, p_expires_at TIMESTAMPTZ
)
RETURNS TABLE(state_version BIGINT)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  UPDATE public.whatsapp_conversations c
     SET state_step = p_step, state_data = COALESCE(p_state_data, '{}'::jsonb),
         state_version = c.state_version + 1, state_expires_at = p_expires_at,
         updated_at = now()
   WHERE c.conversation_id = p_conversation_id AND c.state_version = p_expected_version
  RETURNING c.state_version;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_whatsapp_state(UUID, BIGINT, TEXT, JSONB, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_whatsapp_state(UUID, BIGINT, TEXT, JSONB, TIMESTAMPTZ) TO service_role;

-- Capacity and booking creation commit together. Fare and booking fee are
-- read inside the transaction; caller-supplied financial values do not exist.
CREATE OR REPLACE FUNCTION public.create_capacity_checked_booking(
  p_operation_key TEXT, p_booking_id TEXT, p_trip_id TEXT, p_departure_id UUID,
  p_name TEXT, p_phone TEXT, p_email TEXT, p_student_id TEXT, p_seats INTEGER,
  p_destination TEXT, p_pickup TEXT, p_location TEXT,
  p_booking_type TEXT DEFAULT 'WhatsApp'
)
RETURNS TABLE(outcome TEXT, booking_id TEXT, reason TEXT)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_departure public.route_departures%ROWTYPE;
  v_route public.routes%ROWTYPE;
  v_reserved INTEGER;
  v_fee BIGINT;
  v_existing TEXT;
BEGIN
  IF p_operation_key IS NULL OR btrim(p_operation_key) = ''
     OR p_booking_id IS NULL OR btrim(p_booking_id) = '' THEN
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'invalid_operation'; RETURN;
  END IF;
  IF p_seats IS NULL OR p_seats < 1 OR p_seats > 10 THEN
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'invalid_seats'; RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('booking-operation:' || p_operation_key));
  SELECT b.booking_id INTO v_existing
    FROM public.bookings b WHERE b.source_operation_key = p_operation_key;
  IF FOUND THEN RETURN QUERY SELECT 'existing', v_existing, NULL::TEXT; RETURN; END IF;

  SELECT * INTO v_departure
    FROM public.route_departures d WHERE d.id = p_departure_id FOR UPDATE;
  IF NOT FOUND OR v_departure.status <> 'published' OR v_departure.travel_date < CURRENT_DATE THEN
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'departure_unavailable'; RETURN;
  END IF;

  SELECT * INTO v_route FROM public.routes r WHERE r.id = v_departure.route_id FOR SHARE;
  IF NOT FOUND OR v_route.status <> 'active' OR v_route.fare <= 0 THEN
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'route_unavailable'; RETURN;
  END IF;

  SELECT COALESCE(sum(b.seats), 0)::INTEGER INTO v_reserved
    FROM public.bookings b
   WHERE b.departure_id = v_departure.id
     AND lower(COALESCE(b.status, 'booked')) NOT IN ('cancelled', 'expired');
  IF v_reserved + p_seats > v_departure.capacity THEN
    RETURN QUERY SELECT 'rejected', NULL::TEXT, 'insufficient_seats'; RETURN;
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
    now() + interval '48 hours', 'whatsapp', p_operation_key
  );

  RETURN QUERY SELECT 'created', p_booking_id, NULL::TEXT;
EXCEPTION WHEN unique_violation THEN
  SELECT b.booking_id INTO v_existing
    FROM public.bookings b WHERE b.source_operation_key = p_operation_key;
  IF FOUND THEN RETURN QUERY SELECT 'existing', v_existing, NULL::TEXT;
  ELSE RETURN QUERY SELECT 'rejected', NULL::TEXT, 'identifier_conflict'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_capacity_checked_booking(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_capacity_checked_booking(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_whatsapp_retention()
RETURNS TABLE(deleted_messages BIGINT, deleted_events BIGINT)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_messages BIGINT; v_events BIGINT;
BEGIN
  DELETE FROM public.communication_messages m
   WHERE m.channel = 'whatsapp' AND m.created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_messages = ROW_COUNT;
  DELETE FROM public.whatsapp_webhook_events e
   WHERE e.created_at < now() - interval '1 year';
  GET DIAGNOSTICS v_events = ROW_COUNT;
  RETURN QUERY SELECT v_messages, v_events;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_whatsapp_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_whatsapp_retention() TO service_role;

COMMIT;

-- Staging verification:
-- SELECT relname, relrowsecurity FROM pg_class
-- WHERE relname LIKE 'whatsapp_%' OR relname = 'route_departures';
