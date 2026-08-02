-- Fixes AMB-005 from docs/ambassador-system-audit.md.
--
-- `ambassador_applications` was defined twice, incompatibly:
--   - db/ambassador_applications_migration.sql (explicitly does NOT enable RLS)
--   - referral_system_migration.sql:264-347 (enables RLS, adds 5 policies,
--     including `applications_public_insert ... WITH CHECK (true)`, which
--     places no restriction on row contents — any authenticated caller
--     could in principle insert a row with status pre-set to 'approved',
--     bypassing admin review entirely)
-- Both use CREATE TABLE IF NOT EXISTS, so the actual production schema
-- depends on undocumented run order. This migration is the single
-- canonical source of truth going forward: ensures the table/columns exist
-- (no-op if already correct), forces RLS on with a safe INSERT policy, and
-- adds the duplicate-application defense the audit found completely
-- missing (AMB-007) as a real database constraint, not just app-level
-- best-effort.
--
-- Idempotent, EXCEPT for the unique index step, which is deliberately
-- guarded to refuse to run if duplicate (email, student_id) rows already
-- exist in production — this migration must not silently merge, delete, or
-- otherwise touch existing applicant data. If it raises the exception
-- below, dedupe the flagged rows manually first, then re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.ambassador_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    student_id TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    whatsapp_number TEXT,
    university TEXT NOT NULL DEFAULT 'Mzuzu University',
    faculty TEXT,
    program TEXT NOT NULL,
    year_of_study INTEGER,
    profile_image_url TEXT,
    motivation TEXT NOT NULL,
    leadership_experience TEXT,
    marketing_experience TEXT,
    social_media_influence TEXT,
    communities TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by_id UUID REFERENCES public.profiles(id),
    rejection_reason TEXT,
    terms_accepted_at TIMESTAMPTZ
);

-- The applicant's "I agree to the ambassador terms" checkbox was
-- previously never transmitted to or stored by the server at all — purely
-- decorative client-side state. Recording *when* consent was given (not
-- just a boolean) is a small addition since we're already touching this
-- table.
ALTER TABLE public.ambassador_applications
    ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- year_of_study bound, added defensively (one of the two original files had
-- this check, the other didn't — whichever created the table first wins
-- for a fresh install, so add it here if missing).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ambassador_applications_year_of_study_check'
  ) THEN
    ALTER TABLE public.ambassador_applications
      ADD CONSTRAINT ambassador_applications_year_of_study_check
      CHECK (year_of_study IS NULL OR (year_of_study >= 1 AND year_of_study <= 6));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_timestamp ON public.ambassador_applications;
DROP TRIGGER IF EXISTS set_ambassador_applications_updated_at ON public.ambassador_applications;
CREATE TRIGGER set_ambassador_applications_updated_at
BEFORE UPDATE ON public.ambassador_applications
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ambassador_applications_status ON public.ambassador_applications (status);
CREATE INDEX IF NOT EXISTS idx_ambassador_applications_email ON public.ambassador_applications (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_ambassador_applications_student_id ON public.ambassador_applications (student_id);

-- Duplicate-application defense (AMB-007). Refuses to proceed if the data
-- already contains duplicates, rather than silently dropping/merging rows.
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT LOWER(email), student_id
    FROM public.ambassador_applications
    GROUP BY LOWER(email), student_id
    HAVING count(*) > 1
  ) dupes;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Found % duplicate (email, student_id) group(s) in ambassador_applications. Resolve these manually (merge/close the older applications) before re-running this migration to add the uniqueness constraint.', duplicate_count;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ambassador_applications_email_student
    ON public.ambassador_applications (LOWER(email), student_id);

ALTER TABLE public.ambassador_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS applications_admin_full_access ON public.ambassador_applications;
CREATE POLICY applications_admin_full_access
ON public.ambassador_applications
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Replaces the dangerous WITH CHECK (true) from referral_system_migration.sql:
-- a caller may still insert their own application, but may never set a
-- status other than 'pending' — approval/rejection remains admin-only via
-- the FOR ALL policy above (which the app's service-role client always
-- uses anyway; this is the RLS-layer backstop).
DROP POLICY IF EXISTS applications_public_insert ON public.ambassador_applications;
CREATE POLICY applications_public_insert
ON public.ambassador_applications
FOR INSERT
TO authenticated
WITH CHECK (status = 'pending');

DROP POLICY IF EXISTS applications_self_select ON public.ambassador_applications;
CREATE POLICY applications_self_select
ON public.ambassador_applications
FOR SELECT
TO authenticated
USING (email = auth.email());

DROP POLICY IF EXISTS applications_self_update ON public.ambassador_applications;
CREATE POLICY applications_self_update
ON public.ambassador_applications
FOR UPDATE
TO authenticated
USING (email = auth.email() AND status = 'pending')
WITH CHECK (email = auth.email() AND status = 'pending');

-- Verification (run after applying):
--   SELECT indexname FROM pg_indexes WHERE tablename = 'ambassador_applications';
--   -- expect: ux_ambassador_applications_email_student present
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'ambassador_applications';
