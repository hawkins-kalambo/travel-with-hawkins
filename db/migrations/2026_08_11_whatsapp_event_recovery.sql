-- WhatsApp webhook-event recovery selection.
--
-- STATUS: NOT APPLIED. Additive only. Review and exercise against an isolated
-- staging database before applying anywhere. Depends on
-- 2026_08_10_whatsapp_customer_service.sql already being applied.
--
-- WHY THIS EXISTS
-- The webhook persists events and then processes them in a Next.js `after()`
-- callback. `after()` is bounded by the hosting function's lifetime: if the
-- function is recycled or times out, queued work is dropped and the event row
-- is left in `received` (never picked up) or `processing` (claimed, then the
-- worker died). There is currently no scheduled process that re-drives those
-- rows, so this migration only provides the *selection + stale-claim reset*
-- primitive. It does not, and cannot, run the application-level handling.
--
-- REMAINING BLOCKER (not solved here)
-- A scheduled caller is still required — e.g. a Vercel Cron entry hitting a
-- new `/api/cron/whatsapp-recover` route, gated by `CRON_SECRET` the same way
-- `/api/cron/expire-bookings` is. For each id this function returns, that
-- route must call the existing `claim_whatsapp_webhook_event(id)` RPC and then
-- the app's `processWhatsAppEvent(id)`. That route and the cron entry are
-- deliberately not included here; add them under separate review.
--
-- SAFETY
-- - Events already in `processed` are never returned, so a message whose
--   Phase 2 handling failed after persistence is NOT auto-replayed. That
--   preserves the at-most-once handling boundary in lib/whatsapp/processor.ts:
--   booking and payment operations are idempotent by key, but outbound
--   WhatsApp sends are not.
-- - `p_max_attempts` bounds retries of `failed` rows so a poison event stops
--   being re-driven (claim_whatsapp_webhook_event already increments
--   processing_attempts on every claim).

BEGIN;

CREATE OR REPLACE FUNCTION public.recover_whatsapp_webhook_events(
  p_max_attempts INTEGER DEFAULT 5,
  p_stale_minutes INTEGER DEFAULT 15
)
RETURNS TABLE(event_id UUID)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := now() - make_interval(mins => GREATEST(p_stale_minutes, 1));
BEGIN
  -- A row stuck in `processing` past the stale window means the worker that
  -- claimed it never finished. Return it to `failed` so the normal
  -- claim path (received/failed) can pick it up again.
  UPDATE public.whatsapp_webhook_events e
     SET processing_status = 'failed',
         processing_started_at = NULL,
         last_error_code = 'stale_claim_reset',
         updated_at = now()
   WHERE e.processing_status = 'processing'
     AND e.processing_started_at IS NOT NULL
     AND e.processing_started_at < v_cutoff;

  RETURN QUERY
  SELECT e.id
    FROM public.whatsapp_webhook_events e
   WHERE (
           (e.processing_status = 'received' AND e.created_at < v_cutoff)
        OR (e.processing_status = 'failed'   AND e.processing_attempts < GREATEST(p_max_attempts, 1))
         )
   ORDER BY e.created_at
   LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_whatsapp_webhook_events(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_whatsapp_webhook_events(INTEGER, INTEGER) TO service_role;

COMMIT;

-- Staging verification (after applying):
-- SELECT * FROM public.recover_whatsapp_webhook_events(5, 15);
-- Expect: only ids of rows older than the stale window in received/failed
-- state, with failed rows below the attempt cap; processed/fresh rows absent.
