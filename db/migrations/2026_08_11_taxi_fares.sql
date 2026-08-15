-- Marketplace Expansion, Stage 3: first slice of the taxi vertical.
-- Unlike intercity (admin-managed corridors between a district and a
-- university), a real taxi marketplace needs each approved operator
-- pricing their own point-to-point legs independently — there's no shared
-- "one operator owns the corridor" model to hang this off of, so it gets
-- its own table rather than overloading public.routes (which is also
-- shaped around university_id/direction/commission concepts that don't
-- apply here).
--
-- The gate that matters is the operator's own service_approvals row for
-- service_type = 'taxi' (admin-controlled, see app/api/admin/operators/
-- service-approvals) — once approved, the operator manages their own fare
-- legs directly, same as they already self-manage their fleet.
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS public.taxi_fares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id UUID NOT NULL REFERENCES public.operators(id) ON DELETE CASCADE,
    origin_label TEXT NOT NULL,
    destination_label TEXT NOT NULL,
    fare BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT taxi_fares_unique_leg UNIQUE (operator_id, origin_label, destination_label)
);

CREATE INDEX IF NOT EXISTS idx_taxi_fares_operator_id ON public.taxi_fares (operator_id);
CREATE INDEX IF NOT EXISTS idx_taxi_fares_status ON public.taxi_fares (status);

DROP TRIGGER IF EXISTS set_taxi_fares_updated_at ON public.taxi_fares;
CREATE TRIGGER set_taxi_fares_updated_at
BEFORE UPDATE ON public.taxi_fares
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Deny-by-default RLS, same posture as every other operator-facing table —
-- all access goes through server routes using the service-role client.
ALTER TABLE public.taxi_fares ENABLE ROW LEVEL SECURITY;

-- Verification (run after applying):
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'taxi_fares';
--   -- expect true.
--   SELECT conname FROM pg_constraint WHERE conname = 'taxi_fares_unique_leg';
--   -- expect one row.
