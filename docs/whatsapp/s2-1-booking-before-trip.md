# WhatsApp Stage 2.1 — booking before a trip is created

Implements master-plan **§A**: a customer can book a supported route on a
preferred future **date** even when there is no scheduled `route_departures`
row. The booking is real and enforces the same fee / deadline / unpaid-limit
rules as the scheduled path; it is simply **unassigned** (`departure_id IS
NULL`) until an admin links transport later.

Stacked on `whatsapp-p2-pilot-booking`. Nothing here is committed, deployed, or
applied to production yet.

## Conversation flow

`Make a Booking` → `route_origin` (district). If `findAvailableDepartures`
returns nothing **and** we are in booking mode:

| Step | Handler does |
| --- | --- |
| `route_pick` | `listBookableRoutes(origin)` → WhatsApp list, row ids `route:<id>`. Picking a **priced** route stores `{routeId, routeLabel, pickup, fare}` and asks for a date. Picking an **unpriced** route (`fare <= 0`) is logged (`logWarn`) and the customer is returned to the menu with `routeUnpriced` — **no fare is guessed, no details are collected**. |
| `route_date` | `parseFutureTravelDate` (`YYYY-MM-DD`, today or later). Invalid → `invalidTravelDate`, no advance. Valid → stores `booking.travelDate`, continues to `booking_passenger_for`. |
| `booking_passenger_for` … `booking_student_id` | unchanged (shared with the scheduled path). |
| `booking_review` | No `departureId` ⇒ `reviewSummaryUnassigned`: shows **Requested date**, omits the pickup line, appends `unassignedNote` ("not a specific seat, vehicle or pickup time"). |
| confirm | `createUnassignedWhatsAppBooking` → RPC `create_route_booking_no_departure`. Held message is a `bookingHeldUnassigned*` variant ("Transport for {date} will be assigned later"). |

`Find a Route` (non-booking) is unchanged — no departures still gives the plain
"no published travel dates" reply.

"Back" from passenger details in this flow returns to `route_date` (there is no
departure step to go back to).

## Rules (all mirrored from the scheduled path)

| Rule | Where |
| --- | --- |
| One passenger / one seat / one reference | RPC inserts `seats = 1`, `departure_id = NULL` |
| Fee deadline anchored to **23:59 Malawi** on the requested date | RPC: `v_travel_ts := (p_travel_date + TIME '23:59:59') AT TIME ZONE 'Africa/Blantyre'`; `requestedDateEpochMs` mirrors it in TS |
| `>= 7 days` away → `now()+7d` capped at `travel-24h`; `< 7 days` → `now()+15min` | RPC (same expression as `create_capacity_checked_booking`) |
| Requested date `< 24h` away → not bookable | RPC rejects `departure_too_soon` |
| Requested date in the past → rejected | RPC rejects `date_in_past` |
| Unpriced route → flagged, never guessed | `route_pick` handler + RPC reject `route_unpriced` (defence in depth) |
| Max 3 active unpaid reservations per contact; **unassigned bookings count**; fee-paid frees the slot | RPC counts `bookings.whatsapp_contact_id` where `booking_fee_status <> 'paid'` and status not cancelled/completed |
| Trip creation / assignment must **not** extend the deadline | `assign_whatsapp_booking` only sets `departure_id` / `assigned_at` / `assigned_by`; it never touches `booking_expires_at`, the reference, or payments |
| Payment before transport is allowed | fee checkout path is unchanged and does not depend on `departure_id` |
| Expiry covers unassigned bookings; releases capacity only if a seat was allocated | `expire_whatsapp_reservations()` already filters on source/fee/status/deadline only; capacity is computed per `departure_id`, so cancelling a `NULL`-departure booking frees nothing |

## Admin: assign transport later

`app/api/admin/whatsapp/unassigned-bookings/route.ts`

- `GET` — list unassigned WhatsApp bookings, newest first. Optional
  `?routeId=` and `?date=YYYY-MM-DD` filters.
- `GET ?bookingId=<id>` — candidate published departures for that booking
  (same route + same requested date + seats remaining, via
  `assignableDeparturesFor`).
- `POST {bookingId, departureId}` — `assign_whatsapp_booking` RPC:
  locks the booking and the departure, validates `booking_source = 'whatsapp'`,
  not already assigned, route match, date match, `status = 'published'`, and
  capacity, then sets `departure_id` / `assigned_at` / `assigned_by`.
  Rejections map to 400 / 404 / 409. Reference, payments and requested date are
  preserved; no duplicate allocation (both rows are `FOR UPDATE`).

The admin UI for this (filter + assign controls, readable cards) is Stage 2.2.

## Migration — NOT APPLIED

`db/migrations/2026_08_30_whatsapp_unassigned_bookings.sql` (additive):

- `bookings.assigned_at`, `bookings.assigned_by` (FK `auth.users`, `ON DELETE
  SET NULL`) — audit of a later assignment.
- Partial index `idx_bookings_whatsapp_unassigned` on `(route_id, travel_date)
  WHERE booking_source = 'whatsapp' AND departure_id IS NULL` — the admin
  filter.
- `create_route_booking_no_departure(...)` — new. Same INSERT column list as
  `create_capacity_checked_booking`, with `departure_id = NULL` and
  `travel_date = p_travel_date`. No per-departure capacity check (there is no
  departure).
- `assign_whatsapp_booking(p_booking_id, p_departure_id, p_actor)` — new.

Both functions are `SECURITY INVOKER SET search_path = ''` and granted to
`service_role` only.

**Apply order:** after `2026_08_29_whatsapp_pilot_booking_rules.sql` (and its
prerequisites). Additive and idempotent (`IF NOT EXISTS` / `CREATE OR
REPLACE`); safe to run before the code ships — the new RPCs are simply unused
until then.

**Staging checks** (bottom of the SQL file):

```sql
SELECT proname, pronargs FROM pg_proc
WHERE proname IN ('create_route_booking_no_departure','assign_whatsapp_booking');
SELECT column_name FROM information_schema.columns
WHERE table_name = 'bookings' AND column_name IN ('assigned_at','assigned_by');
```

## Deploy order

1. Merge the P1 + P2 branches first (this is stacked on them); their migrations
   must already be live.
2. Apply `2026_08_30_whatsapp_unassigned_bookings.sql` to the target database.
3. Ship the code. No env-var or Vercel/Meta change. Groq activation unchanged.
4. Rollback: the code degrades to "no published travel dates" if the RPCs are
   missing; dropping the two functions and the two columns reverts the schema
   (no data migration).

## Tests

- `lib/whatsapp/i18n.test.ts` — the 11 new keys exist in both languages;
  operational ones are on the human-review list.
- `lib/whatsapp/domain.test.ts` — `listBookableRoutes` shaping / `priced` flag /
  inactive-embed filtering; `loadBookableRoute` null; `createUnassignedWhatsAppBooking`
  refuses an unpriced route before the RPC and maps a `created` RPC row.
- `lib/whatsapp/processor.flows.test.ts` — no-departure fallback to `route_pick`
  (booking mode only), priced vs unpriced route pick, date validation,
  unassigned review copy (no pickup line, "assigned later"), unassigned confirm
  path, `route_unpriced` rejection.

`npm run typecheck:whatsapp`, `npm run test:whatsapp` (164 pass), `npm run lint`
on the touched files, and full `tsc --noEmit` all clean.

## Not in this stage

Admin inbox UI + cards + assign controls (2.2), outbound attachments (2.2),
automatic receipts (2.3), integration test + deploy runbook (2.4).
