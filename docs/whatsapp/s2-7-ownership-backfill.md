# WhatsApp — booking ownership: backfill + authoritative admin view (Phase A / §4.4)

Two parts:
1. **Backfill** historical WhatsApp-created bookings onto the canonical owner
   link so **My Bookings** shows them.
2. **Tighten the admin conversation view** to that same canonical link so the
   two sides agree and neither surfaces bookings that aren't verifiably owned
   by the contact.

## What the reported IDs actually were

Diagnostics on `BK-MTE1ALHH-IVK0` / `BK-MSCQEGNZ-KI9V`:

```
booking_source = 'web', booking_type = 'route', source_operation_key = NULL,
phone = '+265989127308'  (the business's OWN number / old website CTA number)
```

They are **website** bookings placed against the business's own phone number
(test data), not customer WhatsApp bookings. The admin inbox showed them only
because it did a loose `bookings.phone = <conversation number>` match — which is
exactly the leak §4.4 warns about ("never leak the existence of another
customer's booking"). The backfill correctly does **not** touch web bookings;
the admin-view change below is what stops them being presented as the WhatsApp
account's bookings.

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

## Admin conversation view — now authoritative (code, no migration)

`app/api/admin/whatsapp/conversations/[id]/route.ts` and `.../conversations/route.ts`:

- **`bookings`** (the panel, and the list-row chip) now come from
  `bookings.whatsapp_contact_id = <contact>` **plus** anything this
  conversation's flow created (`whatsapp_booking_operations`) — the same
  authority the bot's My Bookings uses. They can no longer disagree for
  WhatsApp bookings.
- Loose phone-string matches are still fetched but returned **separately** as
  `phoneMatchBookings` and shown in the details pane under a collapsed, muted
  *"N other bookings on this phone number — not verified as this WhatsApp
  account"* — agents keep the context without it being presented as the
  customer's bookings.

## Not in this change

- A single extracted `getBookingsForWhatsAppContact` module shared by both call
  sites (brief §4.4) — both now use the same query shape; extracting it is a
  tidy-up, not a behaviour change.
- Pagination / "More" in My Bookings when a contact owns many bookings
  (brief §5.4) — the list fetches 15, the interactive list shows 10. Follow-up.

## Verify after applying

```sql
SELECT booking_id, whatsapp_contact_id FROM public.bookings
 WHERE booking_id IN ('BK-MTE1ALHH-IVK0', 'BK-MSCQEGNZ-KI9V');   -- both non-null
```
Then open **My Bookings** from that WhatsApp number and confirm both appear.
