-- Phase 1: Payments, wallet ledger, payout requests, audit log foundation.
--
-- Context (verified against the live database before writing this migration):
--   - public.bookings has no tracked DDL (created outside migrations) but is
--     confirmed to already have: id, booking_id, customer_id, fare,
--     payment_status, status, ambassador_id, commission_amount, referral_*.
--     `fare` already means the transport fare; there is currently no separate
--     booking-fee concept per booking (only a global default in `settings`).
--   - public.referrals (see referral_system_migration.sql) already functions
--     as the ambassador "commission per booking" record (one row per booking,
--     UNIQUE on booking_id). This migration does not replace it — it adds the
--     wallet ledger and payout workflow on top of it.
--   - public.commission_transactions is defined in referral_system_migration.sql
--     but does not exist in the live database (never applied) and nothing in
--     the app writes to it. It is superseded here by wallet_transactions +
--     payout_requests + payments(payment_type='ambassador_payout') and is
--     intentionally not resurrected, to avoid a duplicate/dead implementation.
--   - Confirmed via a read-only anon-key probe that bookings/referrals/
--     ambassadors/customer_profiles/admins already reject anon reads today
--     (RLS or missing grants — either way, already closed). New tables below
--     still get RLS explicitly enabled with default-deny policies so they
--     don't rely on that same undocumented protection.
--   - This migration only ADDs columns/tables; nothing existing is renamed or
--     dropped, per project policy.
--
-- Safe to run multiple times (IF NOT EXISTS / idempotent guards throughout).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================================
-- 1. Booking fee vs. transport fare split on public.bookings
-- =========================================================================
-- `fare` (existing column) continues to mean the transport fare amount.
-- `booking_fee_*` is new and mandatory-per-spec: the compulsory fee that
-- confirms a seat, independent of whether the fare is paid online or cash.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_fee_amount BIGINT,
  ADD COLUMN IF NOT EXISTS booking_fee_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS booking_fee_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fare_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS fare_payment_method TEXT,
  ADD COLUMN IF NOT EXISTS fare_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fare_cash_collected_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS fare_cash_collected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booking_expires_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_booking_fee_status_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_booking_fee_status_check
      CHECK (booking_fee_status IN ('unpaid','processing','paid','failed','refunded','partially_refunded'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_fare_status_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_fare_status_check
      CHECK (fare_status IN ('unpaid','processing','paid','cash_selected','cash_collected','partially_paid','failed','refunded'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_fare_payment_method_check'
  ) THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_fare_payment_method_check
      CHECK (fare_payment_method IS NULL OR fare_payment_method IN ('paychangu','cash','bank_transfer','manual_adjustment'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bookings_booking_fee_status ON public.bookings (booking_fee_status);
CREATE INDEX IF NOT EXISTS idx_bookings_fare_status ON public.bookings (fare_status);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_expires_at ON public.bookings (booking_expires_at);

-- =========================================================================
-- 2. Payments (one row per payment attempt; never overwritten)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id TEXT,
    customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ambassador_id UUID REFERENCES public.ambassadors(id) ON DELETE SET NULL,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('booking_fee','transport_fare','ambassador_payout','refund','adjustment')),
    provider TEXT NOT NULL DEFAULT 'paychangu',
    internal_reference TEXT NOT NULL,
    provider_reference TEXT,
    currency TEXT NOT NULL DEFAULT 'MWK',
    expected_amount BIGINT NOT NULL CHECK (expected_amount >= 0),
    paid_amount BIGINT,
    status TEXT NOT NULL DEFAULT 'initialized' CHECK (status IN ('initialized','processing','paid','failed','cancelled','refunded','partially_refunded')),
    payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('paychangu','cash','bank_transfer','manual_adjustment')),
    provider_status TEXT,
    failure_reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    initialized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payments_internal_reference_unique UNIQUE (internal_reference)
);

CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON public.payments (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON public.payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_ambassador_id ON public.payments (ambassador_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_payment_type ON public.payments (payment_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_reference ON public.payments (provider_reference) WHERE provider_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_set_updated_at ON public.payments;
CREATE TRIGGER payments_set_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Raw provider events for webhook idempotency (one row per delivered event).
CREATE TABLE IF NOT EXISTS public.payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES public.payments(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'paychangu',
    event_type TEXT,
    provider_event_id TEXT,
    idempotency_key TEXT NOT NULL,
    raw_payload JSONB,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payment_events_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_payment_events_payment_id ON public.payment_events (payment_id);

-- =========================================================================
-- 3. Ambassador payout requests
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES public.ambassadors(id) ON DELETE CASCADE,
    requested_amount BIGINT NOT NULL CHECK (requested_amount > 0),
    currency TEXT NOT NULL DEFAULT 'MWK',
    payout_method TEXT NOT NULL CHECK (payout_method IN ('airtel_money','tnm_mpamba','bank_transfer','other')),
    destination_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','under_review','approved','rejected','processing','paid','failed','cancelled')),
    reviewer_id UUID REFERENCES auth.users(id),
    reviewer_notes TEXT,
    rejection_reason TEXT,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    paid_at TIMESTAMPTZ,
    payment_reference TEXT,
    payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payout_requests_ambassador_id ON public.payout_requests (ambassador_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON public.payout_requests (status);

-- Only one active (non-final) payout request per ambassador at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payout_requests_one_active_per_ambassador
    ON public.payout_requests (ambassador_id)
    WHERE status IN ('draft','submitted','under_review','approved','processing');

DROP TRIGGER IF EXISTS payout_requests_set_updated_at ON public.payout_requests;
CREATE TRIGGER payout_requests_set_updated_at
    BEFORE UPDATE ON public.payout_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 4. Ambassador wallet ledger (append-only; balances are always derived)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES public.ambassadors(id) ON DELETE CASCADE,
    referral_id UUID REFERENCES public.referrals(id) ON DELETE SET NULL,
    payout_request_id UUID REFERENCES public.payout_requests(id) ON DELETE SET NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('commission_credit','commission_reversal','payout_reservation','payout_completion','payout_failure_release','manual_adjustment')),
    direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
    amount BIGINT NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'MWK',
    balance_category TEXT NOT NULL CHECK (balance_category IN ('pending','available','reserved','paid')),
    status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
    description TEXT,
    reference TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_ambassador_id ON public.wallet_transactions (ambassador_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_referral_id ON public.wallet_transactions (referral_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_payout_request_id ON public.wallet_transactions (payout_request_id);

-- Derived balances — never trust a stored "balance" column, always sum the ledger.
CREATE OR REPLACE VIEW public.ambassador_wallet_balances
WITH (security_invoker = true) AS
SELECT
    ambassador_id,
    COALESCE(SUM(amount) FILTER (WHERE balance_category = 'pending' AND direction = 'credit'), 0)
      - COALESCE(SUM(amount) FILTER (WHERE balance_category = 'pending' AND direction = 'debit'), 0) AS pending_balance,
    COALESCE(SUM(amount) FILTER (WHERE balance_category = 'available' AND direction = 'credit'), 0)
      - COALESCE(SUM(amount) FILTER (WHERE balance_category = 'available' AND direction = 'debit'), 0) AS available_balance,
    COALESCE(SUM(amount) FILTER (WHERE balance_category = 'reserved' AND direction = 'credit'), 0)
      - COALESCE(SUM(amount) FILTER (WHERE balance_category = 'reserved' AND direction = 'debit'), 0) AS reserved_balance,
    COALESCE(SUM(amount) FILTER (WHERE balance_category = 'paid' AND direction = 'credit'), 0)
      - COALESCE(SUM(amount) FILTER (WHERE balance_category = 'paid' AND direction = 'debit'), 0) AS paid_total
FROM public.wallet_transactions
WHERE status = 'posted'
GROUP BY ambassador_id;

-- =========================================================================
-- 5. System-wide audit log
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_role TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    previous_value JSONB,
    new_value JSONB,
    ip_address TEXT,
    user_agent TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);

-- =========================================================================
-- 6. Row Level Security
-- =========================================================================
-- All access from the app today goes through the service-role client, which
-- always bypasses RLS. These policies exist for defense-in-depth so the
-- anon/authenticated keys can never read or write these tables directly,
-- plus narrow self-service reads for customers/ambassadors and admin reads.

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view own payments" ON public.payments;
CREATE POLICY "Customers can view own payments" ON public.payments
    FOR SELECT USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage payments" ON public.payments;
CREATE POLICY "Admins can manage payments" ON public.payments
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
    );

DROP POLICY IF EXISTS "Admins can view payment events" ON public.payment_events;
CREATE POLICY "Admins can view payment events" ON public.payment_events
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
    );

DROP POLICY IF EXISTS "Ambassadors can view own payout requests" ON public.payout_requests;
CREATE POLICY "Ambassadors can view own payout requests" ON public.payout_requests
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.ambassadors a WHERE a.id = payout_requests.ambassador_id AND a.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Ambassadors can submit own payout requests" ON public.payout_requests;
CREATE POLICY "Ambassadors can submit own payout requests" ON public.payout_requests
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.ambassadors a WHERE a.id = payout_requests.ambassador_id AND a.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Admins can manage payout requests" ON public.payout_requests;
CREATE POLICY "Admins can manage payout requests" ON public.payout_requests
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
    );

DROP POLICY IF EXISTS "Ambassadors can view own wallet ledger" ON public.wallet_transactions;
CREATE POLICY "Ambassadors can view own wallet ledger" ON public.wallet_transactions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.ambassadors a WHERE a.id = wallet_transactions.ambassador_id AND a.user_id = auth.uid())
    );

DROP POLICY IF EXISTS "Admins can manage wallet ledger" ON public.wallet_transactions;
CREATE POLICY "Admins can manage wallet ledger" ON public.wallet_transactions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
    );

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
    );

-- No client-facing INSERT/UPDATE/DELETE policy on audit_logs: writes are
-- service-role only (audit_logs must be append-only and tamper-proof from
-- the client's perspective).
