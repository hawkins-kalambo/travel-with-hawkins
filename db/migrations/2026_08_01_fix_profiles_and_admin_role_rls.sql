-- Fixes AMB-004 from docs/ambassador-system-audit.md.
--
-- `referral_system_migration.sql` defines:
--   CREATE POLICY profiles_self_read_update ON public.profiles
--   FOR SELECT, UPDATE TO authenticated USING (id = auth.uid());
--
-- `FOR SELECT, UPDATE` is not valid PostgreSQL syntax — CREATE POLICY's FOR
-- clause accepts exactly one command. If this file was ever run as-written,
-- that policy does not exist. Nearly every other "is admin" RLS policy in
-- this schema depends on being able to read one's own `profiles` row
-- (`EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role =
-- 'admin')`), so a missing self-read policy can make those checks evaluate
-- false for everyone when accessed via the anon/authenticated key (the app
-- itself is unaffected today because it authorizes via the service-role
-- client, not RLS — but RLS should still be correct as defense-in-depth).
--
-- Splitting into two policies also surfaces a second, more serious bug: the
-- original policy had no WITH CHECK on the UPDATE side at all, meaning a
-- self-update policy — if it had ever been created — would have let any
-- authenticated user rewrite their own `role` column to 'admin'. This
-- migration closes that with a trigger, since a WITH CHECK subquery can't
-- easily say "this column may only change via the service role".
--
-- Idempotent: safe to run multiple times.

DROP POLICY IF EXISTS profiles_self_read_update ON public.profiles;

DROP POLICY IF EXISTS profiles_self_select ON public.profiles;
CREATE POLICY profiles_self_select
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Belt-and-suspenders: even with the WITH CHECK above (which only pins the
-- row identity, not individual column values), block role changes made by
-- anything other than the service role, regardless of which policy path
-- allowed the UPDATE through.
CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'role may only be changed by an administrator';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_role_change_trigger ON public.profiles;
CREATE TRIGGER prevent_self_role_change_trigger
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_role_change();

-- Verification (run after applying):
--   SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'profiles';
--   -- expect: profiles_admin_full_access (ALL), profiles_self_select (SELECT),
--   --         profiles_self_update (UPDATE)
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.profiles'::regclass;
--   -- expect: prevent_self_role_change_trigger present alongside set_profiles_updated_at
