-- Automatic payment receipts over WhatsApp (master plan §D / Stage 2.3).
--
-- STATUS: NOT APPLIED. Additive / widening only. Review and exercise against
-- isolated staging. Depends on 2026_08_07_manual_fare_and_receipt_delivery.sql.
--
-- What it does:
--   1. Generalises the existing receipt-delivery outbox from email-only to a
--      per-channel outbox (adds 'whatsapp'). Adds 'pending' (enqueued, not yet
--      attempted) and 'blocked' (outside the 24h window, no usable template —
--      kept for admin, never reported as sent) states, an attempt counter, and
--      the provider message id.
--   2. enqueue_payment_receipt_delivery() - durably records that a receipt is
--      owed on a channel, as part of finalisation, so a crash before the send
--      cannot lose it. Idempotent (UNIQUE(payment_id, channel)).
--   3. claim_payment_receipt_delivery() - channel-parametrised claim
--      (pending|failed -> sending). claim_payment_receipt_email() is kept as a
--      thin wrapper so the current email path is untouched.
--   4. Private 'payment-receipts' storage bucket for the canonical generated
--      PDF (one immutable object per payment; reused by email, WhatsApp and
--      admin download - never regenerated per later payment).

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.payment_receipt_deliveries
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.payment_receipt_deliveries
  DROP CONSTRAINT IF EXISTS payment_receipt_deliveries_channel_check;
ALTER TABLE public.payment_receipt_deliveries
  ADD CONSTRAINT payment_receipt_deliveries_channel_check
  CHECK (channel IN ('email', 'whatsapp'));

ALTER TABLE public.payment_receipt_deliveries
  DROP CONSTRAINT IF EXISTS payment_receipt_deliveries_status_check;
ALTER TABLE public.payment_receipt_deliveries
  ADD CONSTRAINT payment_receipt_deliveries_status_check
  CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'blocked'));

CREATE INDEX IF NOT EXISTS idx_payment_receipt_deliveries_redrive
  ON public.payment_receipt_deliveries (status, updated_at)
  WHERE status IN ('pending', 'failed');

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_payment_receipt_delivery(
  p_payment_id UUID, p_channel TEXT, p_recipient TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_recipient IS NULL OR btrim(p_recipient) = '' THEN RETURN; END IF;
  INSERT INTO public.payment_receipt_deliveries (payment_id, channel, recipient, status)
  VALUES (p_payment_id, p_channel, p_recipient, 'pending')
  ON CONFLICT (payment_id, channel) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_payment_receipt_delivery(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_payment_receipt_delivery(UUID, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_payment_receipt_delivery(
  p_payment_id UUID, p_channel TEXT, p_recipient TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_count INTEGER := 0;
BEGIN
  INSERT INTO public.payment_receipt_deliveries (payment_id, channel, recipient, status)
  VALUES (p_payment_id, p_channel, p_recipient, 'sending')
  ON CONFLICT (payment_id, channel) DO NOTHING;
  IF FOUND THEN RETURN TRUE; END IF;

  UPDATE public.payment_receipt_deliveries
     SET status = 'sending', recipient = p_recipient, error_message = NULL,
         attempts = attempts + 1, updated_at = now()
   WHERE payment_id = p_payment_id AND channel = p_channel
     AND status IN ('pending', 'failed');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_payment_receipt_delivery(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_payment_receipt_delivery(UUID, TEXT, TEXT) TO service_role;

-- Back-compat wrapper: the existing email path keeps working unchanged.
CREATE OR REPLACE FUNCTION public.claim_payment_receipt_email(p_payment_id UUID, p_recipient TEXT)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.claim_payment_receipt_delivery(p_payment_id, 'email', p_recipient);
$$;

REVOKE ALL ON FUNCTION public.claim_payment_receipt_email(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_payment_receipt_email(UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Rows a re-drive job should retry: pending, or failed under the attempt cap.
-- 'sending' is deliberately excluded — an ambiguous send timeout leaves the
-- row 'sending' with an error_message for an admin to resolve, never auto-retried.
CREATE OR REPLACE FUNCTION public.due_payment_receipt_deliveries(p_limit INTEGER DEFAULT 50)
RETURNS TABLE(payment_id UUID, channel TEXT, tx_ref TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.payment_id, d.channel, p.internal_reference
    FROM public.payment_receipt_deliveries d
    JOIN public.payments p ON p.id = d.payment_id
   WHERE (d.status = 'pending' OR (d.status = 'failed' AND d.attempts < 5))
   ORDER BY d.updated_at ASC
   LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;

REVOKE ALL ON FUNCTION public.due_payment_receipt_deliveries(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.due_payment_receipt_deliveries(INTEGER) TO service_role;

COMMIT;

-- Staging verification:
--   SELECT id, public FROM storage.buckets WHERE id = 'payment-receipts';
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.payment_receipt_deliveries'::regclass AND contype = 'c';
--   SELECT proname FROM pg_proc WHERE proname IN
--    ('enqueue_payment_receipt_delivery','claim_payment_receipt_delivery',
--     'claim_payment_receipt_email','due_payment_receipt_deliveries');
