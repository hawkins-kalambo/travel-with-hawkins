# WhatsApp P2 — pilot booking rules

Implements master-plan P2 in **pilot form** (decisions D2 / D11 / D01 / D02 / D05):

- **D2** — WhatsApp keeps its own inventory (`routes` + `route_departures`).
  Publish departures that do **not** overlap live website trips. Unifying the
  website (`settings.routes`) and structured inventory is a separate project.
- **D11** — scheduling via **Vercel Cron** (`vercel.json`), gated by
  `CRON_SECRET`.
- **D01** — `<7 days` to departure: booking fee due immediately, **15-minute**
  seat hold.
- **D02** — departures **within 24h** are not bookable on WhatsApp. This also
  settles the 7-day boundary: exactly-7-days-out routes to immediate payment.
- **D05** — fixed limit of **3** active unpaid reservations per WhatsApp
  contact. No admin override in the pilot (an organiser needing more is
  handled by an agent).

## Rules enforced

| Rule | Where |
| --- | --- |
| One passenger / one seat / one reference (R02) | `create_capacity_checked_booking` rejects `p_seats <> 1`; the flow has no seat-count step |
| Fee deadline: 7 days out → `now()+7d` capped at `departure-24h` (R05) | RPC, `planBookingDeadline` mirrors it for the pre-confirmation preview |
| Fee deadline: `<7 days` → `now()+15min` (R07/D01) | RPC |
| Departure `<24h` → not bookable (D02) | `findAvailableDepartures` filters the list; RPC rejects `departure_too_soon` |
| Max 3 unpaid reservations per contact (R08); fee-paid frees the slot (R09); cancelled/completed don't count (R10) | RPC counts `bookings.whatsapp_contact_id` under the advisory lock |
| Secure booking↔contact link (§4/§3.2) | `bookings.whatsapp_contact_id`, set only by the RPC — never from an entered phone number |
| Deadline re-request cannot extend a hold (§3.1) | `getOrCreateBookingFeeCheckout` reuses the existing payment/link; the RPC never rewrites `booking_expires_at` for an existing booking |
| Chat reset ≠ seat release (§6) | restart/menu clears only `state_data`; a real reservation is only ended by cancellation or the expiry job |

## Migration — NOT APPLIED

`db/migrations/2026_08_29_whatsapp_pilot_booking_rules.sql` (additive):

- `bookings.whatsapp_contact_id`, `bookings.policy_version` (+ index)
- `create_capacity_checked_booking(...)` **dropped and recreated** with two new
  trailing params (`p_whatsapp_contact_id`, `p_policy_version`) and the new
  return columns (`expires_at`, `fare`, `booking_fee`). The deployed code calls
  it by **named** args, so the added params are transparent.
- `expire_whatsapp_reservations()` — releases seats for unpaid past-deadline
  WhatsApp reservations (`Booked` → `Cancelled`).

Apply order: after `2026_08_10` and `2026_08_07`. Requires the P1 branch
(`whatsapp-stuck-conversation-fix`) merged first (this branch is stacked on
it) and `2026_08_28_communication_conversations_allow_whatsapp.sql`.
`2026_08_11_whatsapp_event_recovery.sql` must be applied before the
`whatsapp-recover-events` cron does anything (the route degrades quietly if
it isn't).

## Vercel Cron

`vercel.json` schedules (Vercel **Hobby** allows at most one run per day per
cron; a more frequent expression fails the deployment):

| Route | Schedule (UTC) | Does |
| --- | --- | --- |
| `/api/cron/whatsapp-expire-reservations` | `0 2 * * *` | `expire_whatsapp_reservations()` |
| `/api/cron/whatsapp-recover-events` | `0 3 * * *` | `recover_whatsapp_webhook_events(5,15)` then re-processes returned ids |

Both require `Authorization: Bearer $CRON_SECRET` and fail closed (401) without
it. Set `CRON_SECRET` in Vercel Production (Vercel injects it automatically for
its own cron invocations once set on the project).

**Cadence (D11).** Daily is a stopgap for the pilot. It is safe: the fee
deadline is enforced **inline** in `create_capacity_checked_booking()`, so a
slow cleanup cron cannot create an invalid or extended hold — an expired seat
just stays visually "held" until the next run. For tighter cleanup without a
plan upgrade (none is authorised), point an **external scheduler** at the same
two `CRON_SECRET`-gated URLs every 10–15 min — e.g. a GitHub Actions
`schedule:` workflow doing
`curl -sf -H "Authorization: Bearer $CRON_SECRET" https://www.travelwithhawkins.com/api/cron/whatsapp-expire-reservations`,
cron-job.org, or a Supabase `pg_cron` HTTP job. Upgrading to Vercel Pro
(per-minute crons) is the other option but is out of scope here.

## Deferred to later phases (not in this pilot)

- Post-payment confirmation loop + WhatsApp PDF receipts/tickets (P3/P4).
- Durable notification jobs; reminders; templates outside the 24h window (P5).
- Admin inbox booking/customer cards, outbound attachments (P4).
- Verified WhatsApp↔customer-account link and staff-assisted access recovery
  (§4) — the pilot links bookings to the contact but does not verify identity.
- Unifying website + structured inventory (D2).
