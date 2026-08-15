-- Marketplace Expansion, Stage 1: shared data foundation.
--
-- Introduces operators, operator staff, per-service approvals, vehicles,
-- drivers, and a unified compliance-document table — none of which exist
-- anywhere in the codebase today. Also generalizes the structured `routes`
-- table so a route can terminate at a plain public destination instead of
-- only a university, and tags every route with an owning operator.
--
-- Nothing customer-facing changes. This migration only adds tables/columns
-- and backfills a single internal operator so every existing route keeps
-- resolving exactly as it does today. See docs/route-model-decision.md for
-- why the structured `routes` table (not settings.route_objects) is the
-- foundation this builds on.
--
-- Idempotent: every statement is safe to run more than once.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================================
-- 1. Operators
-- =========================================================================
-- application_status tracks onboarding (Master Plan §4.3 "Application").
-- status tracks the operator's lifecycle once created (Master Plan §4.3
-- "Operator") and starts at 'draft' alongside application_status, moving to
-- 'approved' then 'active' as Stage 2's onboarding flow drives it forward.
--
-- Contact fields are nullable at the database level; Stage 2's onboarding
-- API is where "a real operator must supply these" gets enforced, not here
-- — the single internal operator backfilled below has no single honest
-- contact_email/phone to invent, and the schema shouldn't require one.
CREATE TABLE IF NOT EXISTS public.operators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    is_individual BOOLEAN NOT NULL DEFAULT false,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    application_status TEXT NOT NULL DEFAULT 'draft'
        CHECK (application_status IN ('draft', 'submitted', 'under_review', 'changes_required', 'approved', 'rejected')),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'approved', 'active', 'paused', 'suspended', 'closed')),
    paychangu_connect_account_id TEXT,
    paychangu_connect_status TEXT NOT NULL DEFAULT 'not_connected'
        CHECK (paychangu_connect_status IN ('not_connected', 'pending', 'connected', 'disabled')),
    notes TEXT,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    suspended_at TIMESTAMPTZ,
    suspended_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    suspension_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operators_status ON public.operators (status);
CREATE INDEX IF NOT EXISTS idx_operators_application_status ON public.operators (application_status);

DROP TRIGGER IF EXISTS set_operators_updated_at ON public.operators;
CREATE TRIGGER set_operators_updated_at
BEFORE UPDATE ON public.operators
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 2. Operator staff (mirrors university_admin_assignments: a scoped
--    assignment table, not a role baked into `profiles`)
-- =========================================================================
-- Unlike university_admin (one role, variable per-assignment permission
-- booleans), operator staff have distinct named roles that map to fixed
-- permission sets (Master Plan §4.4) — so no separate boolean columns here;
-- Stage 2's application code derives permissions from staff_role, the same
-- way lib/permissions.ts derives them from a profiles.role name today.
CREATE TABLE IF NOT EXISTS public.operator_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    staff_role TEXT NOT NULL
        CHECK (staff_role IN ('owner', 'manager', 'dispatcher', 'finance_officer', 'booking_agent', 'driver')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT operator_memberships_operator_user_unique UNIQUE (operator_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_operator_memberships_operator_id ON public.operator_memberships (operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_memberships_user_id ON public.operator_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_operator_memberships_active_user ON public.operator_memberships (user_id, status);

DROP TRIGGER IF EXISTS set_operator_memberships_updated_at ON public.operator_memberships;
CREATE TRIGGER set_operator_memberships_updated_at
BEFORE UPDATE ON public.operator_memberships
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 3. Per-service approvals (Master Plan §4.1: multi-service operators get
--    separate approval for each service category)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.service_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL CHECK (service_type IN ('intercity', 'taxi', 'car_hire')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT service_approvals_operator_service_unique UNIQUE (operator_id, service_type)
);

CREATE INDEX IF NOT EXISTS idx_service_approvals_operator_id ON public.service_approvals (operator_id);
CREATE INDEX IF NOT EXISTS idx_service_approvals_status ON public.service_approvals (status);

DROP TRIGGER IF EXISTS set_service_approvals_updated_at ON public.service_approvals;
CREATE TRIGGER set_service_approvals_updated_at
BEFORE UPDATE ON public.service_approvals
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 4. Vehicles
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL CHECK (service_type IN ('intercity', 'taxi', 'car_hire')),
    registration_number TEXT NOT NULL,
    make TEXT,
    model TEXT,
    capacity INTEGER,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'maintenance', 'expired_documents', 'suspended', 'retired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT vehicles_registration_number_unique UNIQUE (registration_number)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_operator_id ON public.vehicles (operator_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON public.vehicles (status);

DROP TRIGGER IF EXISTS set_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER set_vehicles_updated_at
BEFORE UPDATE ON public.vehicles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 5. Drivers
-- =========================================================================
-- user_id is nullable: a driver exists as a compliance/roster record from
-- the moment an operator adds them, whether or not they ever get portal
-- access (operator_memberships with staff_role='driver' is the separate,
-- optional grant of that access).
CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    license_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'inactive', 'expired_licence', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT drivers_license_number_unique UNIQUE (license_number)
);

CREATE INDEX IF NOT EXISTS idx_drivers_operator_id ON public.drivers (operator_id);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON public.drivers (status);

DROP TRIGGER IF EXISTS set_drivers_updated_at ON public.drivers;
CREATE TRIGGER set_drivers_updated_at
BEFORE UPDATE ON public.drivers
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 6. Compliance documents (operator, vehicle, and driver documents share
--    one status model per Master Plan §4.3 — one table, polymorphic subject,
--    same pattern audit_logs already uses for entity_type/entity_id)
-- =========================================================================
-- operator_id is always set, even for a vehicle/driver's document, so
-- "every document for operator X" is one indexed query with no join across
-- three tables. subject_id is intentionally not a foreign key: it points at
-- operators, vehicles, or drivers depending on subject_type, same rationale
-- as audit_logs.entity_id. document_type is free text rather than a CHECK
-- enum since the document taxonomy will grow per service type without
-- needing a migration each time.
CREATE TABLE IF NOT EXISTS public.operator_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
    subject_type TEXT NOT NULL CHECK (subject_type IN ('operator', 'vehicle', 'driver')),
    subject_id UUID NOT NULL,
    document_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'verified', 'rejected', 'expiring', 'expired', 'replaced')),
    expires_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operator_documents_operator_id ON public.operator_documents (operator_id);
CREATE INDEX IF NOT EXISTS idx_operator_documents_subject ON public.operator_documents (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_operator_documents_status ON public.operator_documents (status);
CREATE INDEX IF NOT EXISTS idx_operator_documents_expires_at ON public.operator_documents (expires_at);

DROP TRIGGER IF EXISTS set_operator_documents_updated_at ON public.operator_documents;
CREATE TRIGGER set_operator_documents_updated_at
BEFORE UPDATE ON public.operator_documents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 7. Generalize `routes`: nullable university_id, an operator owner, and a
--    plain destination for non-university public-intercity corridors.
--    See docs/route-model-decision.md for the full reasoning.
-- =========================================================================

ALTER TABLE public.routes ALTER COLUMN university_id DROP NOT NULL;

ALTER TABLE public.routes
    ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES public.operators(id),
    ADD COLUMN IF NOT EXISTS destination_label TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'routes_destination_required'
    ) THEN
        ALTER TABLE public.routes
            ADD CONSTRAINT routes_destination_required
            CHECK (university_id IS NOT NULL OR destination_label IS NOT NULL);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_routes_operator_id ON public.routes (operator_id);

-- =========================================================================
-- 8. Audit-log tenant marker (mirrors the university_id addition in
--    2026_08_08_university_admin_assignments.sql)
-- =========================================================================
ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES public.operators(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_operator_id ON public.audit_logs (operator_id);

-- =========================================================================
-- 9. Extend the canonical profile role constraint for the operator-staff
--    auth domain. No application code sets this role yet (that's Stage 2) —
--    this only makes the value legal at the database level ahead of time,
--    the same order university_admin's constraint change landed in.
-- =========================================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('super_admin', 'admin', 'university_admin', 'viewer', 'ambassador', 'operator_staff', 'customer'));

-- =========================================================================
-- 10. Row Level Security — enabled, zero anon/authenticated policies, same
--     deny-by-default posture as university_admin_assignments and the
--     universities/routes tables. Every read/write goes through server
--     routes using the service-role client, built starting Stage 2.
-- =========================================================================
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_documents ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 11. Backfill: one internal operator owns every route/booking that exists
--     today, so operator_id can go from nullable to required later without
--     a second migration having to guess which operator old rows belong to.
-- =========================================================================
INSERT INTO public.operators (legal_name, display_name, is_individual, application_status, status)
SELECT 'Travel With Hawkins', 'Travel With Hawkins', false, 'approved', 'active'
WHERE NOT EXISTS (SELECT 1 FROM public.operators WHERE display_name = 'Travel With Hawkins');

INSERT INTO public.service_approvals (operator_id, service_type, status, reviewed_at)
SELECT o.id, 'intercity', 'approved', now()
FROM public.operators o
WHERE o.display_name = 'Travel With Hawkins'
  AND NOT EXISTS (
      SELECT 1 FROM public.service_approvals sa
      WHERE sa.operator_id = o.id AND sa.service_type = 'intercity'
  );

UPDATE public.routes
SET operator_id = (SELECT id FROM public.operators WHERE display_name = 'Travel With Hawkins')
WHERE operator_id IS NULL;

-- Verification (run after applying):
--   SELECT display_name, application_status, status FROM public.operators;
--   -- expect exactly one row: 'Travel With Hawkins', 'approved', 'active'.
--   SELECT service_type, status FROM public.service_approvals;
--   -- expect one 'intercity' / 'approved' row.
--   SELECT count(*) FROM public.routes WHERE operator_id IS NULL;
--   -- expect 0.
--   SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name = 'routes' AND column_name IN ('university_id', 'operator_id', 'destination_label');
--   -- university_id and destination_label should be nullable ('YES');
--   -- operator_id nullable for now too (enforced NOT NULL in a later stage).
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('operators', 'operator_memberships', 'service_approvals', 'vehicles', 'drivers', 'operator_documents');
--   -- relrowsecurity should be true for all six.
