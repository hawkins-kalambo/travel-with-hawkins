-- Admin-recorded fare payments and idempotent automatic receipt delivery.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.payment_receipt_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email')),
  recipient TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending','sent','failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_id, channel)
);

ALTER TABLE public.payment_receipt_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_receipt_deliveries FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_payment_receipt_email(p_payment_id UUID, p_recipient TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO public.payment_receipt_deliveries (payment_id, channel, recipient, status)
  VALUES (p_payment_id, 'email', p_recipient, 'sending')
  ON CONFLICT (payment_id, channel) DO NOTHING;
  IF FOUND THEN RETURN TRUE; END IF;

  UPDATE public.payment_receipt_deliveries
  SET status = 'sending', recipient = p_recipient, error_message = NULL, updated_at = now()
  WHERE payment_id = p_payment_id AND channel = 'email' AND status = 'failed';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_receipt_email(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_payment_receipt_email(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.record_manual_fare_payment(
  p_booking_id TEXT, p_actor_user_id UUID, p_payment_method TEXT,
  p_internal_reference TEXT, p_provider_reference TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(payment_id UUID, booking_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_amount BIGINT;
  v_payment_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_payment_method NOT IN ('cash', 'bank_transfer', 'manual_adjustment') THEN
    RAISE EXCEPTION 'Unsupported manual fare payment method';
  END IF;

  SELECT * INTO v_booking FROM public.bookings
  WHERE bookings.booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_booking.booking_fee_status <> 'paid' THEN RAISE EXCEPTION 'Booking fee must be paid first'; END IF;
  IF v_booking.fare_status IN ('paid', 'cash_collected') THEN RAISE EXCEPTION 'Fare is already settled'; END IF;

  v_amount := COALESCE(v_booking.fare, 0) * GREATEST(COALESCE(v_booking.seats, 1), 1);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Fare amount is not configured'; END IF;

  INSERT INTO public.payments (
    booking_id, customer_id, payment_type, provider, internal_reference, provider_reference,
    currency, expected_amount, paid_amount, status, payment_method, provider_status,
    metadata, verified_at, paid_at
  ) VALUES (
    p_booking_id, v_booking.customer_id, 'transport_fare', 'manual', p_internal_reference,
    NULLIF(trim(p_provider_reference), ''), 'MWK', v_amount, v_amount, 'paid', p_payment_method,
    'confirmed_by_admin', jsonb_build_object('notes', COALESCE(p_notes, ''), 'recorded_by', p_actor_user_id), v_now, v_now
  ) RETURNING id INTO v_payment_id;

  UPDATE public.bookings
  SET fare_status = CASE WHEN p_payment_method = 'cash' THEN 'cash_collected' ELSE 'paid' END,
      fare_payment_method = p_payment_method,
      fare_paid_at = CASE WHEN p_payment_method = 'cash' THEN NULL ELSE v_now END,
      fare_cash_collected_by = CASE WHEN p_payment_method = 'cash' THEN p_actor_user_id ELSE NULL END,
      fare_cash_collected_at = CASE WHEN p_payment_method = 'cash' THEN v_now ELSE NULL END
  WHERE bookings.booking_id = p_booking_id;

  RETURN QUERY SELECT v_payment_id, p_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_manual_fare_payment(TEXT, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_manual_fare_payment(TEXT, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
