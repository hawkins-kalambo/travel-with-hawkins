-- referral_system_migration.sql (root of repo) already contains
-- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and CREATE POLICY statements
-- for profiles/ambassadors/referrals — but its
-- `profiles_self_read_update` policy uses `FOR SELECT, UPDATE`, which is
-- not valid PostgreSQL (CREATE POLICY's FOR clause accepts exactly one
-- command). db/migrations/2026_08_01_fix_profiles_and_admin_role_rls.sql
-- already documents and fixes this for the two `profiles` self-service
-- policies specifically.
--
-- What that earlier fix doesn't address: if referral_system_migration.sql
-- was run as a single multi-statement batch (the normal way to run a SQL
-- file via the Supabase SQL editor or psql), a syntax error partway
-- through stops execution at that statement — everything defined *after*
-- the broken `profiles_self_read_update` policy in the same file
-- (`ambassadors_admin_full_access`, `ambassadors_ambassador_own_view`,
-- `referrals_admin_full_access`, `referrals_ambassador_own_view`) may
-- never have been created at all, even though `ENABLE ROW LEVEL SECURITY`
-- for those same tables — which runs *before* the broken statement in the
-- same file — likely did succeed. That combination (RLS on, zero
-- policies) happens to be safe by accident (deny-all for anon/
-- authenticated; this app's own access is via the service-role client
-- either way) but isn't something to leave to chance.
--
-- This re-asserts RLS + every policy from that section of
-- referral_system_migration.sql, correcting the invalid syntax. Every
-- statement is idempotent, so this is safe to run regardless of whether
-- the original file never ran, ran and failed partway through, or somehow
-- ran to completion already.
--
-- CORRECTED after a live run: referral_system_migration.sql's own
-- ambassador policies key off `ambassadors.profile_id`, but per
-- 2026_08_01_declare_ambassadors_user_id.sql the live table never had that
-- column — every real column is `user_id`. Both ambassador-facing policies
-- below use `user_id` instead.

ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ambassadors ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_admin_full_access ON public.profiles;
CREATE POLICY profiles_admin_full_access
ON public.profiles
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS ambassadors_admin_full_access ON public.ambassadors;
CREATE POLICY ambassadors_admin_full_access
ON public.ambassadors
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS ambassadors_ambassador_own_view ON public.ambassadors;
CREATE POLICY ambassadors_ambassador_own_view
ON public.ambassadors
FOR SELECT
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'ambassador')
    AND user_id = auth.uid()
);

DROP POLICY IF EXISTS referrals_admin_full_access ON public.referrals;
CREATE POLICY referrals_admin_full_access
ON public.referrals
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS referrals_ambassador_own_view ON public.referrals;
CREATE POLICY referrals_ambassador_own_view
ON public.referrals
FOR SELECT
TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.profiles AS p WHERE p.id = auth.uid() AND p.role = 'ambassador')
    AND ambassador_id IN (
        SELECT id
        FROM public.ambassadors
        WHERE user_id = auth.uid()
    )
);

-- Note: this does not re-create profiles_self_select / profiles_self_update
-- — db/migrations/2026_08_01_fix_profiles_and_admin_role_rls.sql already
-- owns those two and additionally installs the role-change-prevention
-- trigger; re-apply that file too if you haven't already.

-- Verification (run after applying):
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('profiles', 'ambassadors', 'referrals');
--   -- relrowsecurity should be true for all three.
--   SELECT tablename, policyname FROM pg_policies
--   WHERE tablename IN ('profiles', 'ambassadors', 'referrals') ORDER BY tablename, policyname;
--   -- expect profiles_admin_full_access, ambassadors_admin_full_access,
--   -- ambassadors_ambassador_own_view, referrals_admin_full_access,
--   -- referrals_ambassador_own_view (plus profiles_self_select /
--   -- profiles_self_update from the 2026_08_01 migration).
