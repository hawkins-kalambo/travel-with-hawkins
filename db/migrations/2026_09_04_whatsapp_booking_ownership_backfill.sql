-- Backfill canonical WhatsApp ownership onto historical bookings (master plan
-- §4.3 / Phase A). This is what makes "My Bookings" show pre-existing bookings
-- (e.g. the reported BK-MTE1ALHH-IVK0, BK-MSCQEGNZ-KI9V) instead of
-- "You have no bookings linked to this WhatsApp number yet."
--
-- STATUS: NOT APPLIED. Data backfill — additive, idempotent, non-destructive.
-- Depends on 2026_08_29_whatsapp_pilot_booking_rules.sql (bookings.whatsapp_contact_id).
--
-- What it does:
--   1. wa_normalize_mw_phone(text) - conservative Malawi-number normaliser
--      (returns NULL for anything that is not a recognisable MW number, so a
--      foreign / garbage phone can never match).
--   2. Sets bookings.whatsapp_contact_id for bookings that were CREATED THROUGH
--      WHATSAPP (booking_source = 'whatsapp' OR booking_type = 'WhatsApp' OR a
--      meta:* operation key) whose contact phone normalises to exactly one
--      whatsapp_contacts.wa_id, and only where it is still NULL.
--
-- It never touches web bookings, never overwrites a contact link, never
-- deletes anything. Re-running it is a no-op. Bookings it cannot match with
-- confidence are LEFT for manual review (see the audit queries below) rather
-- than guessed at.

BEGIN;

CREATE OR REPLACE FUNCTION public.wa_normalize_mw_phone(p_phone TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  WITH d AS (SELECT regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g') AS digits)
  SELECT CASE
    WHEN d.digits ~ '^265[1-9][0-9]{7,11}$' THEN '+' || d.digits
    WHEN d.digits ~ '^0[1-9][0-9]{7,10}$'   THEN '+265' || substring(d.digits FROM 2)
    WHEN d.digits ~ '^[1-9][0-9]{7,9}$'     THEN '+265' || d.digits
    ELSE NULL
  END
  FROM d;
$$;

REVOKE ALL ON FUNCTION public.wa_normalize_mw_phone(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_normalize_mw_phone(TEXT) TO service_role;

-- --- Dry run (safe to run before COMMIT / any time): how many rows, and which
-- --- WhatsApp-created bookings would still be unmatched afterwards.
--
--   SELECT count(*) AS will_link
--   FROM public.bookings b
--   JOIN public.whatsapp_contacts c
--     ON c.wa_id = public.wa_normalize_mw_phone(b.phone)
--   WHERE b.whatsapp_contact_id IS NULL
--     AND (b.booking_source = 'whatsapp' OR b.booking_type = 'WhatsApp'
--          OR b.source_operation_key LIKE 'meta:%');
--
--   SELECT b.booking_id, b.phone, b.booking_source, b.booking_type
--   FROM public.bookings b
--   WHERE b.whatsapp_contact_id IS NULL
--     AND (b.booking_source = 'whatsapp' OR b.booking_type = 'WhatsApp'
--          OR b.source_operation_key LIKE 'meta:%')
--     AND NOT EXISTS (
--       SELECT 1 FROM public.whatsapp_contacts c
--       WHERE c.wa_id = public.wa_normalize_mw_phone(b.phone));

UPDATE public.bookings b
   SET whatsapp_contact_id = c.id
  FROM public.whatsapp_contacts c
 WHERE b.whatsapp_contact_id IS NULL
   AND c.wa_id = public.wa_normalize_mw_phone(b.phone)
   AND (
     b.booking_source = 'whatsapp'
     OR b.booking_type = 'WhatsApp'
     OR b.source_operation_key LIKE 'meta:%'
   );

COMMIT;

-- Post-run verification:
--   -- the reported bookings are now linked:
--   SELECT booking_id, whatsapp_contact_id FROM public.bookings
--    WHERE booking_id IN ('BK-MTE1ALHH-IVK0', 'BK-MSCQEGNZ-KI9V');
--   -- count now linked:
--   SELECT count(*) FROM public.bookings WHERE whatsapp_contact_id IS NOT NULL;
--
-- Rollback: this only fills NULLs. To reverse, restore whatsapp_contact_id to
-- NULL for the specific booking_ids captured by the dry-run query above (do NOT
-- blanket-null the column — later WhatsApp bookings set it legitimately).
