-- Fixes AMB-012 from docs/ambassador-system-audit.md.
--
-- lib/rateLimit.ts used a plain in-process `Map` — every server
-- instance/function invocation has its own independent bucket, so in any
-- horizontally-scaled or serverless deployment a client can exceed the
-- intended limit many times over just by landing on different instances.
-- This replaces it with a durable, atomic, shared store backed by Postgres
-- (already the one piece of shared infrastructure this app has everywhere)
-- instead of introducing a new dependency like Redis.
--
-- The INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING pattern below
-- increments-or-resets the bucket in a single atomic statement, avoiding
-- the read-then-write race a naive implementation would have under
-- concurrent requests for the same key.
--
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    reset_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated: only the service role (via the
-- rate_limit_hit() function below, or the service-role Supabase client
-- directly) may touch this table.

CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key TEXT, p_window_seconds INTEGER, p_max INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    INSERT INTO public.rate_limit_buckets AS b (key, count, reset_at)
    VALUES (p_key, 1, now() + make_interval(secs => p_window_seconds))
    ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN b.reset_at < now() THEN 1 ELSE b.count + 1 END,
        reset_at = CASE WHEN b.reset_at < now() THEN now() + make_interval(secs => p_window_seconds) ELSE b.reset_at END
    RETURNING count INTO v_count;

    RETURN v_count > p_max;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, INTEGER) TO service_role;

-- Old buckets accumulate forever otherwise (one row per distinct
-- method:path:ip key ever seen). A cheap periodic cleanup helper — call
-- from a scheduled job/cron if one is ever added; harmless if never called.
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limit_buckets()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    DELETE FROM public.rate_limit_buckets WHERE reset_at < now() - INTERVAL '1 hour';
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_rate_limit_buckets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_rate_limit_buckets() TO service_role;

-- Verification (run after applying):
--   SELECT public.rate_limit_hit('test:key', 60, 2);  -- false
--   SELECT public.rate_limit_hit('test:key', 60, 2);  -- false
--   SELECT public.rate_limit_hit('test:key', 60, 2);  -- true (3rd hit within window, max=2)
--   DELETE FROM public.rate_limit_buckets WHERE key = 'test:key';  -- clean up test row
