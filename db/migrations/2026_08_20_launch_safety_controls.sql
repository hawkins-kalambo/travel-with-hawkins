-- Marketplace Expansion, Phase 3 Step 1: launch-safety controls.
--
-- Adds server-controlled feature flags and a structured incident-management
-- table. Deliberately does NOT add new pause columns to operators/vehicles/
-- drivers/service_approvals — those tables already have working pause/
-- suspend states (see db/migrations/2026_08_10_operators_fleet_foundation.sql)
-- that were simply missing UI/enforcement, not missing schema.
--
-- References public.route_departures (defined in the separate, uncommitted
-- WhatsApp effort's db/migrations/2026_08_10_whatsapp_customer_service.sql)
-- via a nullable FK, same precedent already set by
-- 2026_08_19_web_capacity_and_booking_expiry.sql — this does not edit that
-- file or any WhatsApp-owned code.
--
-- Idempotent: every statement is safe to run more than once.

-- =========================================================================
-- 1. feature_flags — server-controlled kill switches. Enforcement reads
--    happen server-side via the service-role client (lib/featureFlags.ts),
--    same posture as how settings/audit_logs are already read — never via
--    anon/authenticated RLS policies, so none are granted here.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_feature_flags_updated_at ON public.feature_flags;
CREATE TRIGGER set_feature_flags_updated_at
BEFORE UPDATE ON public.feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Seed the seven flags named in the Phase 3 spec. The four gating
-- already-live functionality default enabled (turning one off is a real
-- kill-switch); the three gating not-yet-built functionality default
-- disabled (turning one on is a launch action, not a rollback).
INSERT INTO public.feature_flags (key, enabled, description) VALUES
    ('student_booking_enabled', true, 'Student/custom-destination bookings via the main web flow.'),
    ('public_intercity_enabled', true, 'Structured-route (university-anchored and public destination_label) intercity bookings.'),
    ('taxi_enabled', true, 'Taxi fare bookings.'),
    ('car_hire_enabled', true, 'Car-hire listing bookings.'),
    ('operator_intercity_portal_enabled', false, 'Operator-facing intercity routes/departures/bookings/manifest panels (not yet built).'),
    ('multi_operator_comparison_enabled', false, 'Multi-operator search & compare UI for the same corridor (not yet built; requires a real second operator).'),
    ('wave1_multi_corridor_launch_enabled', false, 'The new multi-corridor marketplace (Mzuzu/Lilongwe/Blantyre multi-operator launch) — distinct from the already-live single-operator booking flow, which this flag does not gate.')
ON CONFLICT (key) DO NOTHING;

-- =========================================================================
-- 2. incidents — structured incident case tracking. State-change history
--    lives in audit_logs (entity_type='incident'), not a bespoke timeline
--    table here — reusing the pattern every other admin mutation already
--    follows, including the "fetch full history for one entity" read shape
--    GET /api/admin/bookings?auditBookingId=... already established.
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number TEXT NOT NULL UNIQUE,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'investigating', 'resolved', 'closed')),
    title TEXT NOT NULL,
    description TEXT,
    scope_type TEXT NOT NULL CHECK (scope_type IN ('marketplace', 'service_type', 'operator', 'route', 'departure', 'listing', 'booking', 'other')),
    scope_service_type TEXT CHECK (scope_service_type IS NULL OR scope_service_type IN ('intercity', 'taxi', 'car_hire')),
    operator_id UUID REFERENCES public.operators(id) ON DELETE SET NULL,
    route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
    departure_id UUID REFERENCES public.route_departures(id) ON DELETE SET NULL,
    booking_id TEXT REFERENCES public.bookings(booking_id) ON DELETE SET NULL,
    reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    resolution TEXT,
    root_cause TEXT,
    corrective_action TEXT,
    customer_communication_sent BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents (status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON public.incidents (severity);
CREATE INDEX IF NOT EXISTS idx_incidents_operator_id ON public.incidents (operator_id);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON public.incidents (created_at DESC);

DROP TRIGGER IF EXISTS set_incidents_updated_at ON public.incidents;
CREATE TRIGGER set_incidents_updated_at
BEFORE UPDATE ON public.incidents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Deny-by-default posture, same as audit_logs/operators — every read/write
-- goes through server routes using the service-role client.
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

-- Verification (run after applying):
--   SELECT key, enabled FROM public.feature_flags ORDER BY key;
--   -- expect 7 rows: student_booking_enabled/public_intercity_enabled/
--   -- taxi_enabled/car_hire_enabled = true; the other three = false.
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('feature_flags', 'incidents');
--   -- relrowsecurity should be true for both.
