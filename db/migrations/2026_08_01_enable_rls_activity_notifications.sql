-- Fixes AMB-020 from docs/ambassador-system-audit.md.
--
-- referral_system_migration.sql defines `ambassador_activity_logs` and
-- `notifications` (lines 114-129) but its ENABLE ROW LEVEL SECURITY block
-- (lines 169-174) never includes either table, and no other migration
-- enables RLS on them. Exposure to the anon/authenticated PostgREST roles
-- has depended entirely on Supabase's project-level default grants ever
-- since. `notifications` stores per-user title/message content, so this is
-- closed explicitly rather than left implicit.
--
-- Idempotent: safe to run multiple times.

ALTER TABLE public.ambassador_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ambassador_activity_logs_admin_full_access ON public.ambassador_activity_logs;
CREATE POLICY ambassador_activity_logs_admin_full_access
ON public.ambassador_activity_logs
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Guarded the same way as 2026_08_01_declare_ambassadors_user_id.sql: the
-- live `ambassadors` table has no `profile_id` column (only `user_id`),
-- unlike what referral_system_migration.sql assumed, so this is built as
-- dynamic SQL to avoid a column-does-not-exist error either way.
DO $$
DECLARE
    has_profile_id BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ambassadors' AND column_name = 'profile_id'
    ) INTO has_profile_id;

    EXECUTE 'DROP POLICY IF EXISTS ambassador_activity_logs_ambassador_own_view ON public.ambassador_activity_logs';

    IF has_profile_id THEN
        EXECUTE 'CREATE POLICY ambassador_activity_logs_ambassador_own_view ON public.ambassador_activity_logs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.ambassadors a WHERE a.id = ambassador_activity_logs.ambassador_id AND (a.user_id = auth.uid() OR a.profile_id = auth.uid())))';
    ELSE
        EXECUTE 'CREATE POLICY ambassador_activity_logs_ambassador_own_view ON public.ambassador_activity_logs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.ambassadors a WHERE a.id = ambassador_activity_logs.ambassador_id AND a.user_id = auth.uid()))';
    END IF;
END;
$$;

DROP POLICY IF EXISTS notifications_admin_full_access ON public.notifications;
CREATE POLICY notifications_admin_full_access
ON public.notifications
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS notifications_self_select ON public.notifications;
CREATE POLICY notifications_self_select
ON public.notifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_self_update ON public.notifications;
CREATE POLICY notifications_self_update
ON public.notifications
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Verification (run after applying):
--   SELECT relrowsecurity FROM pg_class WHERE relname IN ('ambassador_activity_logs', 'notifications');
--   -- expect: both true
--   SELECT policyname, tablename FROM pg_policies WHERE tablename IN ('ambassador_activity_logs', 'notifications');
