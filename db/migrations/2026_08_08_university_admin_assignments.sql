-- Introduces university-scoped operational administrators without changing
-- the existing super_admin/global-admin behavior. Application authorization
-- reads this table with the service-role client and applies university_id
-- predicates to every scoped booking operation.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.university_admin_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    university_id UUID NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    can_manage_bookings BOOLEAN NOT NULL DEFAULT true,
    can_view_reports BOOLEAN NOT NULL DEFAULT true,
    can_confirm_cash BOOLEAN NOT NULL DEFAULT true,
    assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT university_admin_assignments_user_university_unique UNIQUE (user_id, university_id)
);

CREATE INDEX IF NOT EXISTS idx_university_admin_assignments_user_id
    ON public.university_admin_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_university_admin_assignments_university_id
    ON public.university_admin_assignments (university_id);
CREATE INDEX IF NOT EXISTS idx_university_admin_assignments_active_user
    ON public.university_admin_assignments (user_id, status);

DROP TRIGGER IF EXISTS set_university_admin_assignments_updated_at
    ON public.university_admin_assignments;
CREATE TRIGGER set_university_admin_assignments_updated_at
BEFORE UPDATE ON public.university_admin_assignments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.university_admin_assignments ENABLE ROW LEVEL SECURITY;

-- The application accesses assignments only from server-side route handlers
-- using the service-role key. With no anon/authenticated policies, direct
-- browser access is denied by default.

-- Extend the canonical profile role constraint. The constraint name is used
-- by the existing add_role_constraints_to_profiles.sql migration.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('super_admin','admin','university_admin','viewer','ambassador','customer'));

-- Optional tenant marker on audit rows makes cross-university investigations
-- and future tenant-scoped audit reports straightforward. Existing rows stay
-- valid and booking audit writers can adopt this column incrementally.
ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES public.universities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_university_id
    ON public.audit_logs (university_id);

-- Atomic assignment operation used by the super-admin user-management API.
-- The service-role grant means browser clients cannot call it directly.
CREATE OR REPLACE FUNCTION public.set_university_admin_assignments(
    p_user_id UUID,
    p_university_ids UUID[],
    p_actor_id UUID,
    p_can_manage_bookings BOOLEAN DEFAULT true,
    p_can_view_reports BOOLEAN DEFAULT true,
    p_can_confirm_cash BOOLEAN DEFAULT true
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    expected_count INTEGER;
    matched_count INTEGER;
BEGIN
    expected_count := COALESCE(array_length(p_university_ids, 1), 0);
    IF expected_count = 0 THEN
        RAISE EXCEPTION 'At least one university assignment is required';
    END IF;

    SELECT count(DISTINCT id) INTO matched_count
    FROM public.universities
    WHERE id = ANY(p_university_ids);

    IF matched_count <> expected_count THEN
        RAISE EXCEPTION 'One or more university assignments are invalid';
    END IF;

    UPDATE public.profiles
    SET role = 'university_admin'
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target profile was not found';
    END IF;

    DELETE FROM public.university_admin_assignments
    WHERE user_id = p_user_id
      AND university_id <> ALL(p_university_ids);

    INSERT INTO public.university_admin_assignments (
        user_id,
        university_id,
        status,
        can_manage_bookings,
        can_view_reports,
        can_confirm_cash,
        assigned_by
    )
    SELECT
        p_user_id,
        university_id,
        'active',
        p_can_manage_bookings,
        p_can_view_reports,
        p_can_confirm_cash,
        p_actor_id
    FROM unnest(p_university_ids) AS assigned(university_id)
    ON CONFLICT (user_id, university_id) DO UPDATE SET
        status = 'active',
        can_manage_bookings = EXCLUDED.can_manage_bookings,
        can_view_reports = EXCLUDED.can_view_reports,
        can_confirm_cash = EXCLUDED.can_confirm_cash,
        assigned_by = EXCLUDED.assigned_by,
        updated_at = now();

    INSERT INTO public.audit_logs (
        actor_user_id,
        actor_role,
        action,
        entity_type,
        entity_id,
        new_value,
        metadata
    ) VALUES (
        p_actor_id,
        'super_admin',
        'assign_university_admin',
        'profile',
        p_user_id::TEXT,
        jsonb_build_object('role', 'university_admin', 'university_ids', p_university_ids),
        jsonb_build_object('assignment_count', expected_count)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.set_university_admin_assignments(UUID, UUID[], UUID, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_university_admin_assignments(UUID, UUID[], UUID, BOOLEAN, BOOLEAN, BOOLEAN) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_university_admin_assignments(UUID, UUID[], UUID, BOOLEAN, BOOLEAN, BOOLEAN) TO service_role;

-- Verification:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'university_admin_assignments';
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_role_check';
