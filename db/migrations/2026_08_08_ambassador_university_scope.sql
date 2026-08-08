-- Makes university ownership authoritative throughout the ambassador and
-- referral pipeline. Existing rows are backfilled from the structured
-- university catalogue; NOT VALID constraints protect all future writes
-- without making deployment fail when an old free-text value cannot be
-- matched automatically. Any remaining legacy NULLs are listed by the
-- verification query at the end and must be corrected before VALIDATE.

ALTER TABLE public.referrals
    ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES public.universities(id);

CREATE INDEX IF NOT EXISTS idx_referrals_university_id
    ON public.referrals (university_id);

ALTER TABLE public.university_admin_assignments
    ADD COLUMN IF NOT EXISTS can_view_ambassadors BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS can_view_applications BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS can_view_referrals BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS can_view_commissions BOOLEAN NOT NULL DEFAULT TRUE;

-- Resolve legacy university text using, in order, the canonical name, short
-- code, or the pre-catalogue form of a name (for example "Mzuzu University"
-- versus "Mzuzu University (MZUNI)").
WITH ranked_matches AS (
    SELECT ambassador.id AS ambassador_id, university.id AS university_id,
           university.name AS university_name,
           row_number() OVER (PARTITION BY ambassador.id ORDER BY
               CASE WHEN lower(trim(university.name)) = lower(trim(ambassador.university)) THEN 0 ELSE 1 END,
               university.created_at) AS match_rank
    FROM public.ambassadors AS ambassador
    JOIN public.universities AS university
      ON lower(trim(university.name)) = lower(trim(ambassador.university))
      OR lower(trim(university.short_code)) = lower(trim(ambassador.university))
      OR lower(trim(university.name)) LIKE lower(trim(ambassador.university)) || ' (%)'
    WHERE ambassador.university_id IS NULL
      AND NULLIF(trim(ambassador.university), '') IS NOT NULL
)
UPDATE public.ambassadors AS ambassador
SET university_id = matched.university_id, university = matched.university_name
FROM ranked_matches AS matched
WHERE matched.ambassador_id = ambassador.id AND matched.match_rank = 1;

WITH ranked_matches AS (
    SELECT application.id AS application_id, university.id AS university_id,
           university.name AS university_name,
           row_number() OVER (PARTITION BY application.id ORDER BY
               CASE WHEN lower(trim(university.name)) = lower(trim(application.university)) THEN 0 ELSE 1 END,
               university.created_at) AS match_rank
    FROM public.ambassador_applications AS application
    JOIN public.universities AS university
      ON lower(trim(university.name)) = lower(trim(application.university))
      OR lower(trim(university.short_code)) = lower(trim(application.university))
      OR lower(trim(university.name)) LIKE lower(trim(application.university)) || ' (%)'
    WHERE application.university_id IS NULL
      AND NULLIF(trim(application.university), '') IS NOT NULL
)
UPDATE public.ambassador_applications AS application
SET university_id = matched.university_id, university = matched.university_name
FROM ranked_matches AS matched
WHERE matched.application_id = application.id AND matched.match_rank = 1;

-- A referral belongs to the booked university. The ambassador is a safe
-- fallback for historical referrals whose booking row predates structured
-- university ownership.
UPDATE public.referrals AS referral
SET university_id = booking.university_id
FROM public.bookings AS booking
WHERE referral.university_id IS NULL
  AND booking.booking_id = referral.booking_id
  AND booking.university_id IS NOT NULL;

UPDATE public.referrals AS referral
SET university_id = ambassador.university_id
FROM public.ambassadors AS ambassador
WHERE referral.university_id IS NULL
  AND ambassador.id = referral.ambassador_id
  AND ambassador.university_id IS NOT NULL;

ALTER TABLE public.ambassadors
    DROP CONSTRAINT IF EXISTS ambassadors_university_id_required,
    ADD CONSTRAINT ambassadors_university_id_required
        CHECK (university_id IS NOT NULL) NOT VALID;

ALTER TABLE public.ambassador_applications
    DROP CONSTRAINT IF EXISTS ambassador_applications_university_id_required,
    ADD CONSTRAINT ambassador_applications_university_id_required
        CHECK (university_id IS NOT NULL) NOT VALID;

ALTER TABLE public.referrals
    DROP CONSTRAINT IF EXISTS referrals_university_id_required,
    ADD CONSTRAINT referrals_university_id_required
        CHECK (university_id IS NOT NULL) NOT VALID;

-- Post-deploy verification. All counts should be zero before validating the
-- constraints in a later migration.
-- SELECT 'ambassadors' AS source, count(*) FROM public.ambassadors WHERE university_id IS NULL
-- UNION ALL
-- SELECT 'applications', count(*) FROM public.ambassador_applications WHERE university_id IS NULL
-- UNION ALL
-- SELECT 'referrals', count(*) FROM public.referrals WHERE university_id IS NULL;
