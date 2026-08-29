# WhatsApp — historical booking-ownership backfill (Phase A)

Fixes the reported inconsistency: a WhatsApp customer's **My Bookings** returned
"You have no bookings linked to this WhatsApp number yet." while the admin
Communication Center showed their bookings (e.g. `BK-MTE1ALHH-IVK0`,
`BK-MSCQEGNZ-KI9V`).

## Root cause

The two paths use different authorities:

| Path | How it finds bookings |
| --- | --- |
| **Bot — My Bookings** (`listWhatsAppBookings`) | `bookings.whatsapp_contact_id = <contact>` — the canonical owner link, set by the RPC **only for bookings created after** `2026_08_29` added that column. |
| **Admin — conversation view** | `bookings.phone = <wa_id>` — a phone-string match, which also catches older rows. |

So bookings created through WhatsApp **before** the owner column existed have
`whatsapp_contact_id IS NULL` and are invisible to the bot, visible to the
admin. It is a consistency defect, not an empty database.

Going forward is already correct — `createWhatsAppBooking` /
`createUnassignedWhatsAppBooking` set `whatsapp_contact_id` via the RPC. This
migration closes the gap for the **existing** rows.

## Migration — `db/migrations/2026_09_04_whatsapp_booking_ownership_backfill.sql` (NOT APPLIED)

Data backfill — additive, **idempotent**, non-destructive.

- `wa_normalize_mw_phone(text)` — conservative Malawi-number normaliser;
  returns `NULL` for anything not recognisably a MW number, so a foreign or
  malformed phone can never produce a false match.
- Sets `bookings.whatsapp_contact_id = c.id` where **all** of:
  - `whatsapp_contact_id IS NULL` (idempotent — re-run is a no-op),
  - the booking was **created through WhatsApp** —
    `booking_source = 'whatsapp'` OR `booking_type = 'WhatsApp'` OR
    `source_operation_key LIKE 'meta:%'` (web bookings are never touched — a
    coincidental phone match on a web booking is not "created through that
    WhatsApp account"),
  - `wa_normalize_mw_phone(b.phone)` equals exactly one
    `whatsapp_contacts.wa_id` (`wa_id` is unique, so the match is 1:1 — no
    ambiguity).

A WhatsApp-created booking whose phone matches **no** contact is **left
unlinked** for manual review, not guessed at. The migration file carries the
dry-run and post-run audit queries.

Apply order: after `2026_08_29`. Safe to run against production during normal
operation. Rollback = restore `whatsapp_contact_id` to `NULL` for the specific
`booking_id`s the dry-run listed (never blanket-null the column).

## Not in this change

- A shared `getBookingsForWhatsAppContact` service used by both the bot and the
  admin (brief §4.4). After this backfill the two agree for WhatsApp-created
  bookings; the admin keeps its broader `phone`-match view on purpose so agents
  see everything for a number.
- Pagination / "More" in My Bookings when a contact owns many bookings
  (brief §5.4) — the list currently fetches 15 and the interactive list shows
  10. A follow-up.

## Verify after applying

```sql
SELECT booking_id, whatsapp_contact_id FROM public.bookings
 WHERE booking_id IN ('BK-MTE1ALHH-IVK0', 'BK-MSCQEGNZ-KI9V');   -- both non-null
```
Then open **My Bookings** from that WhatsApp number and confirm both appear.
