-- Phase 3A: atomic, idempotent payment-finalization RPC.
--
-- This function is the ONLY place that ever marks a payments row `paid` and
-- updates the matching booking's booking_fee_status/fare_status. It is
-- deliberately narrow: it does not call PayChangu, does not decide whether
-- a payment is legitimate, and does not send notifications or receipts. The
-- caller (application server) must have ALREADY independently verified the
-- payment with PayChangu's GET /verify-payment/{tx_ref} before calling this
-- function — the function still re-validates currency/amount/tx_ref against
-- the stored payment row itself, rather than trusting the caller's claim of
-- success, but it does not re-contact PayChangu.
--
-- Concurrency: the payment row (and its booking row) are locked with
-- `SELECT ... FOR UPDATE` for the duration of the call, so a webhook
-- delivery and a browser callback verifying the same tx_ref at the same
-- moment serialize against each other — the second caller simply observes
-- the already-`paid` result once the first commits, and returns
-- `already_finalized` rather than double-applying the update.
--
-- Safe to run multiple times (CREATE OR REPLACE FUNCTION).

CREATE OR REPLACE FUNCTION public.finalize_payment(
  p_tx_ref TEXT,
  p_verified_currency TEXT,
  p_verified_amount BIGINT,
  p_provider_reference TEXT,
  p_provider_status TEXT DEFAULT NULL,
  p_payment_event_id UUID DEFAULT NULL
)
RETURNS TABLE (
  outcome TEXT,           -- 'finalized' | 'already_finalized' | 'rejected'
  reason TEXT,            -- populated on 'rejected', short machine-readable code
  payment_id UUID,
  booking_id TEXT,
  payment_type TEXT,
  status TEXT,
  paid_amount BIGINT,
  provider_reference TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
BEGIN
  -- Basic input sanity. Reject rather than let a malformed call fall
  -- through to a confusing constraint violation later.
  IF p_tx_ref IS NULL OR btrim(p_tx_ref) = '' THEN
    RETURN QUERY SELECT 'rejected', 'missing_tx_ref', NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::BIGINT, NULL::TEXT;
    RETURN;
  END IF;

  IF p_verified_currency IS NULL OR p_verified_amount IS NULL THEN
    RETURN QUERY SELECT 'rejected', 'missing_verified_fields', NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::BIGINT, NULL::TEXT;
    RETURN;
  END IF;

  IF p_verified_amount < 0 THEN
    RETURN QUERY SELECT 'rejected', 'negative_amount', NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::BIGINT, NULL::TEXT;
    RETURN;
  END IF;

  -- Lock the payment row for the duration of this transaction. A concurrent
  -- caller finalizing the same tx_ref blocks here until we commit or roll
  -- back, then re-reads the (by then updated) row.
  SELECT * INTO v_payment
  FROM public.payments
  WHERE internal_reference = p_tx_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'rejected', 'unknown_tx_ref', NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::BIGINT, NULL::TEXT;
    RETURN;
  END IF;

  IF v_payment.payment_type NOT IN ('booking_fee', 'transport_fare') THEN
    RETURN QUERY SELECT 'rejected', 'unsupported_payment_type', v_payment.id, v_payment.booking_id, v_payment.payment_type, v_payment.status, v_payment.paid_amount, v_payment.provider_reference;
    RETURN;
  END IF;

  -- Load the related booking. booking_id is unique + not null as of the
  -- companion safety migration, so this can match at most one row; the
  -- STRICT-style FOUND check below still guards against a missing booking.
  -- The "b" alias is required, not cosmetic: RETURNS TABLE output columns
  -- (outcome, reason, payment_id, booking_id, payment_type, status,
  -- paid_amount, provider_reference) are implicitly declared as PL/pgSQL
  -- variables for the whole function body, so an unqualified `booking_id`
  -- here would be ambiguous between that variable and the table's own
  -- booking_id column (Postgres error 42702) — a bug that shipped in the
  -- original version of this function and was never caught in Phase 3A
  -- because every test exercised only the early-rejection paths, which
  -- return before reaching this statement.
  SELECT * INTO v_booking
  FROM public.bookings AS b
  WHERE b.booking_id = v_payment.booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'rejected', 'unknown_booking', v_payment.id, v_payment.booking_id, v_payment.payment_type, v_payment.status, v_payment.paid_amount, v_payment.provider_reference;
    RETURN;
  END IF;

  -- Idempotent replay: this payment was already finalized. Only report
  -- success again if the replay data is consistent with what we already
  -- recorded — a mismatched replay is a red flag, not a routine repeat.
  IF v_payment.status = 'paid' THEN
    IF v_payment.currency IS NOT DISTINCT FROM p_verified_currency
       AND v_payment.paid_amount IS NOT DISTINCT FROM p_verified_amount
       AND (v_payment.provider_reference IS NULL OR v_payment.provider_reference IS NOT DISTINCT FROM p_provider_reference)
    THEN
      -- A consistent replay is a settled outcome for this event too, even
      -- though no payment/booking row changes here — without this, a
      -- redelivered webhook for an already-paid payment would never reach
      -- processing_status = 'processed' and would be retried forever.
      IF p_payment_event_id IS NOT NULL THEN
        UPDATE public.payment_events
        SET processing_status = 'processed', processed_at = now()
        WHERE id = p_payment_event_id AND processing_status <> 'processed';
      END IF;

      RETURN QUERY SELECT 'already_finalized', NULL::TEXT, v_payment.id, v_payment.booking_id, v_payment.payment_type, v_payment.status, v_payment.paid_amount, v_payment.provider_reference;
      RETURN;
    ELSE
      RETURN QUERY SELECT 'rejected', 'contradictory_replay', v_payment.id, v_payment.booking_id, v_payment.payment_type, v_payment.status, v_payment.paid_amount, v_payment.provider_reference;
      RETURN;
    END IF;
  END IF;

  -- A payment that previously failed or was cancelled is not eligible to be
  -- silently resurrected by a late/replayed event — only initialized or
  -- processing attempts can be finalized.
  IF v_payment.status NOT IN ('initialized', 'processing') THEN
    RETURN QUERY SELECT 'rejected', 'payment_not_finalizable_from_status', v_payment.id, v_payment.booking_id, v_payment.payment_type, v_payment.status, v_payment.paid_amount, v_payment.provider_reference;
    RETURN;
  END IF;

  -- Currency must match exactly.
  IF p_verified_currency IS DISTINCT FROM v_payment.currency THEN
    RETURN QUERY SELECT 'rejected', 'currency_mismatch', v_payment.id, v_payment.booking_id, v_payment.payment_type, v_payment.status, v_payment.paid_amount, v_payment.provider_reference;
    RETURN;
  END IF;

  -- Amount must match exactly. No partial acceptance of underpayment or
  -- overpayment — either is rejected the same way.
  IF p_verified_amount IS DISTINCT FROM v_payment.expected_amount THEN
    RETURN QUERY SELECT 'rejected', 'amount_mismatch', v_payment.id, v_payment.booking_id, v_payment.payment_type, v_payment.status, v_payment.paid_amount, v_payment.provider_reference;
    RETURN;
  END IF;

  -- A provider reference must not already be attached to a different
  -- payment row. The partial unique index on payments.provider_reference is
  -- the hard guarantee; this is an early, clearer rejection before we'd hit
  -- a unique-violation from the UPDATE below. Same aliasing requirement as
  -- above: provider_reference is also a RETURNS TABLE output column name.
  IF p_provider_reference IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.payments AS existing
    WHERE existing.provider_reference = p_provider_reference
      AND existing.id <> v_payment.id
  ) THEN
    RETURN QUERY SELECT 'rejected', 'provider_reference_conflict', v_payment.id, v_payment.booking_id, v_payment.payment_type, v_payment.status, v_payment.paid_amount, v_payment.provider_reference;
    RETURN;
  END IF;

  -- All checks passed — finalize the payment.
  UPDATE public.payments
  SET
    status = 'paid',
    paid_amount = p_verified_amount,
    provider_status = p_provider_status,
    provider_reference = p_provider_reference,
    payment_method = 'paychangu',
    verified_at = COALESCE(verified_at, now()),
    paid_at = now(),
    failure_reason = NULL,
    updated_at = now()
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;

  -- Update the booking's fee/fare status — never the legacy combined
  -- `payment_status` field, and never the journey `status` field. Those are
  -- owned by the existing manual admin flow and must not be silently
  -- overwritten by an automated payment (see Phase 3A report, "legacy
  -- compatibility").
  -- Aliased for the same reason as the SELECT above — the WHERE clause
  -- target is a general expression context where the RETURNS TABLE
  -- `booking_id` variable and the table column are both otherwise valid
  -- matches. (The SET clause targets like booking_fee_status don't need
  -- this: SET's left-hand side is always resolved as a column of the
  -- table being updated, never a PL/pgSQL variable, so no ambiguity there.)
  IF v_payment.payment_type = 'booking_fee' THEN
    UPDATE public.bookings AS b
    SET
      booking_fee_status = 'paid',
      booking_fee_paid_at = v_payment.paid_at
    WHERE b.booking_id = v_booking.booking_id;
  ELSIF v_payment.payment_type = 'transport_fare' THEN
    UPDATE public.bookings AS b
    SET
      fare_status = 'paid',
      fare_payment_method = 'paychangu',
      fare_paid_at = v_payment.paid_at
    WHERE b.booking_id = v_booking.booking_id;
  END IF;

  -- Only mark the associated webhook event processed once the payment and
  -- booking updates above have both succeeded in this same transaction.
  IF p_payment_event_id IS NOT NULL THEN
    UPDATE public.payment_events
    SET
      processing_status = 'processed',
      processed_at = now()
    WHERE id = p_payment_event_id;
  END IF;

  RETURN QUERY SELECT 'finalized', NULL::TEXT, v_payment.id, v_payment.booking_id, v_payment.payment_type, v_payment.status, v_payment.paid_amount, v_payment.provider_reference;
  RETURN;

EXCEPTION
  WHEN unique_violation THEN
    -- Race-condition fallback for the provider_reference check above (two
    -- concurrent finalizations for different tx_refs somehow sharing a
    -- provider_reference) — the unique partial index is the real guarantee,
    -- this just turns it into the same typed rejection instead of a raw
    -- Postgres error reaching the caller.
    RETURN QUERY SELECT 'rejected', 'provider_reference_conflict', v_payment.id, v_payment.booking_id, v_payment.payment_type, v_payment.status, v_payment.paid_amount, v_payment.provider_reference;
    RETURN;
END;
$$;

-- Least privilege: only the trusted server (service_role) may call this.
-- SECURITY INVOKER (the default, set explicitly above for clarity) means it
-- runs with the caller's own privileges — service_role already has the
-- table access it needs, so no elevation is required or granted.
REVOKE ALL ON FUNCTION public.finalize_payment(TEXT, TEXT, BIGINT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_payment(TEXT, TEXT, BIGINT, TEXT, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_payment(TEXT, TEXT, BIGINT, TEXT, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_payment(TEXT, TEXT, BIGINT, TEXT, TEXT, UUID) TO service_role;
