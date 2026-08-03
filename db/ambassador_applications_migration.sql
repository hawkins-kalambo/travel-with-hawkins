-- Migration: Create ambassador_applications table
-- Run this in Supabase SQL editor or psql as a privileged user

-- Ensure pgcrypto for gen_random_uuid()
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
  year_of_study INTEGER CHECK (year_of_study >= 1 AND year_of_study <= 6),
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
  rejection_reason TEXT
);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp ON public.ambassador_applications;
CREATE TRIGGER set_timestamp
  BEFORE UPDATE ON public.ambassador_applications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();

-- Optional indexes
CREATE INDEX IF NOT EXISTS idx_ambassador_applications_status ON public.ambassador_applications(status);
CREATE INDEX IF NOT EXISTS idx_ambassador_applications_email ON public.ambassador_applications(email);

-- SUPERSEDED: the "prefer keeping RLS disabled" guidance that used to be
-- here was wrong for a table that stores applicant PII (student ID, phone,
-- motivation essay) and has since been corrected. Do not leave RLS off.
--
-- After running this file, always also run
-- db/migrations/2026_08_01_reconcile_ambassador_applications.sql — it
-- enables RLS on this table with real policies (service-role/admin full
-- access, public insert-only, applicant self-select/update scoped to their
-- own row) and adds the duplicate-application uniqueness constraint. See
-- that file's own header comment for the full story.
