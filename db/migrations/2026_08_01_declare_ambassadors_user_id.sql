-- Fixes AMB-015 from docs/ambassador-system-audit.md.
--
-- `public.ambassadors` was originally created with a `profile_id` column
-- (referral_system_migration.sql:17), but every piece of application code
-- that actually creates/reads ambassador records
-- (app/api/ambassadors/route.ts, app/api/applications/review/route.ts,
-- lib/ambassadorActivity.ts, lib/supabaseServer.ts) writes and reads a
-- `user_id` column instead. RLS policies added later
-- (2026_08_01_payments_wallet_audit_foundation.sql) also reference
-- `ambassadors.user_id` for payout/wallet self-view. `user_id` was never
-- formally declared in any tracked migration — this closes that gap so the
-- schema finally matches what the running application actually does.
--
-- CORRECTED after a live run: the actual production `ambassadors` table
-- does not have a `profile_id` column at all (only `referral_system_migration.sql`,
-- which was apparently never what created the live table, assumed it would).
-- Every `profile_id` reference below is now guarded by an information_schema
-- check and executed as dynamic SQL, so this runs cleanly whether or not
-- that column exists.
--
-- Idempotent: safe to run multiple times, safe if user_id already exists.

ALTER TABLE public.ambassadors
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill from the legacy profile_id column, only if it actually exists on
-- this database. In this schema profiles.id IS the auth user id
-- (profiles.id REFERENCES auth.users(id)), so profile_id and user_id would
-- be the same identifier space if profile_id were present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ambassadors' AND column_name = 'profile_id'
  ) THEN
    EXECUTE 'UPDATE public.ambassadors SET user_id = profile_id WHERE user_id IS NULL AND profile_id IS NOT NULL';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ambassadors_user_id_unique
    ON public.ambassadors (user_id)
    WHERE user_id IS NOT NULL;

-- The ambassador-self-view policy in referral_system_migration.sql keys off
-- profile_id, which doesn't exist on the live table. Replace it with a
-- user_id-based policy so ambassadors can actually see their own row under
-- RLS (currently moot for the app itself, which uses the service-role
-- client, but this is the second line of defense). Falls back to a
-- profile_id-inclusive USING clause only if that column turns out to exist.
DO $$
DECLARE
    has_profile_id BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'ambassadors' AND column_name = 'profile_id'
    ) INTO has_profile_id;

    EXECUTE 'DROP POLICY IF EXISTS ambassadors_ambassador_own_view ON public.ambassadors';

    IF has_profile_id THEN
        EXECUTE 'CREATE POLICY ambassadors_ambassador_own_view ON public.ambassadors FOR SELECT TO authenticated USING (user_id = auth.uid() OR profile_id = auth.uid())';
    ELSE
        EXECUTE 'CREATE POLICY ambassadors_ambassador_own_view ON public.ambassadors FOR SELECT TO authenticated USING (user_id = auth.uid())';
    END IF;
END;
$$;

-- Re-create the three payout/wallet self-view policies from the 2026-08-01
-- foundation migration so they are provably correct against a user_id
-- column that is now guaranteed to exist (they referenced it before this
-- migration existed, which could not be verified statically). Guarded so
-- this migration doesn't fail in an environment where that foundation
-- migration hasn't been applied yet.
DO $$
BEGIN
  IF to_regclass('public.payout_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS payout_requests_ambassador_select ON public.payout_requests;
    CREATE POLICY payout_requests_ambassador_select
    ON public.payout_requests
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.ambassadors a
            WHERE a.id = payout_requests.ambassador_id
              AND a.user_id = auth.uid()
        )
    );

    DROP POLICY IF EXISTS payout_requests_ambassador_insert ON public.payout_requests;
    CREATE POLICY payout_requests_ambassador_insert
    ON public.payout_requests
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.ambassadors a
            WHERE a.id = payout_requests.ambassador_id
              AND a.user_id = auth.uid()
        )
    );
  END IF;

  IF to_regclass('public.wallet_transactions') IS NOT NULL THEN
    DROP POLICY IF EXISTS wallet_transactions_ambassador_select ON public.wallet_transactions;
    CREATE POLICY wallet_transactions_ambassador_select
    ON public.wallet_transactions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.ambassadors a
            WHERE a.id = wallet_transactions.ambassador_id
              AND a.user_id = auth.uid()
        )
    );
  END IF;
END;
$$;

-- Verification (run after applying):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'ambassadors' AND column_name = 'user_id';
--   SELECT count(*) FROM public.ambassadors WHERE user_id IS NULL;
--   -- investigate any rows still NULL here — they have no linked auth user
--   -- at all and may need manual linking (e.g. via scripts/repair_ambassadors_user_id.js).
