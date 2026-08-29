# WhatsApp Stage 2.2a — admin Communication Center inbox

Implements master-plan **§B**: the existing WhatsApp inbox inside the admin
Communication Center is improved **in place** (no second inbox). Secure
document/image sending (§C) is Stage 2.2b — this stage is the conversation
UI + API + ownership model it builds on.

Stacked on Stage 2.1. Nothing here is committed, deployed, or applied to
production yet.

## What changed

### DB — `db/migrations/2026_08_31_whatsapp_admin_inbox.sql` (NOT APPLIED)

`whatsapp_conversations` gains three list-view fields so the inbox never scans
`communication_messages` per row:

| Column | Meaning |
| --- | --- |
| `unread_count` | unseen customer messages, agent view |
| `last_customer_message_at` | for "waiting longest" ordering |
| `last_message_preview` | one-line list preview, either direction |

Functions (all `SECURITY INVOKER SET search_path = ''`, `service_role` only):

| Function | Called from | Does |
| --- | --- | --- |
| `bump_whatsapp_unread(conv, preview)` | `recordInbound` (every inbound customer message) | sets preview + timestamps; increments `unread_count` **only** while `mode = 'human'` or `status IN ('waiting','human_controlled')` — a bot-only chat never shows an unread badge |
| `clear_whatsapp_unread(conv)` | detail `GET` | zeroes the badge when an agent opens the thread |
| `touch_whatsapp_last_message(conv, preview)` | `deliverAndRecord` after a successful send | refreshes preview/timestamp without touching unread |
| `claim_whatsapp_conversation(conv, actor, action, target, force)` | `PATCH` | ownership-guarded takeover / assign / resolve / return-to-bot under a row lock |

**Two-agent guard.** `claim_whatsapp_conversation` locks the row `FOR UPDATE`.
If the conversation is `human_controlled` and held by someone other than the
actor, every action returns `outcome = 'conflict'` with the current holder
instead of overwriting. `force := true` (server only allows it for a
`super_admin`) performs a deliberate reassignment.

### `lib/whatsapp/repository.ts`

- `recordInbound` now calls `bump_whatsapp_unread` instead of a bare
  `last_message_at` update.
- `deliverAndRecord(conversation, message, senderId?, origin?)` — new optional
  `origin` (`"agent" | "bot" | "automatic"`), stored in
  `communication_messages.provider_metadata.origin`. Defaults from `senderId`
  (`senderId ? "agent" : "bot"`). Stage 2.3 passes `"automatic"` for receipts.
  On a successful send it also calls `touch_whatsapp_last_message`.

### `lib/whatsapp/inbox.ts` (new, pure — unit-tested)

- `classifySenderKind(row)` → `customer | agent | bot | automatic`
  (`provider_metadata.origin` is authoritative; `sender_id` is the fallback).
- `confirmedDeliveryStatus(status)` → returns the status only if it is one of
  `sent | delivered | read | failed`; anything else (`sending`, `received`,
  `stored`, null) becomes `null`. **The UI never shows a delivery/read claim
  that the provider has not confirmed.**
- `previewFor`, `filterToQuery`, `isInboxFilter` — list helpers.

### API — `GET /api/admin/whatsapp/conversations`

- New `filter` param (`all | unread | waiting | human | bot | resolved`);
  legacy `status` still works.
- Cursor pagination: `?limit=` (default 30, max 100) + `?cursor=<last_message_at>`
  → response carries `nextCursor`.
- Each row: `unread_count`, `preview`, `last_customer_message_at`,
  `assigned_agent_name`, `bookingId`. Search now also matches the preview text.

### API — `GET /api/admin/whatsapp/conversations/[id]`

- `bookings` are **readable cards**, not raw JSON: passenger vs booker,
  booking ref, route, requested date, **transport-assignment status
  (`departure_id` / `assigned_at`) reported separately from** booking-fee
  status **and** fare status, outstanding amount, fee deadline.
- `messages` carry `kind` (sender classification), `senderName`,
  `templateName`, and `deliveryStatus` (provider-confirmed only).
- `conversation` carries `serviceWindowExpiresAt`, `assignedTo` +
  `assignedAgentName`, `unreadCount`, `viewerId`, `viewerRole`.
- Opening the thread clears its unread badge (`clear_whatsapp_unread`).

### API — `PATCH /api/admin/whatsapp/conversations/[id]`

- All four actions (`takeover | assign | resolve | bot`) now go through
  `claim_whatsapp_conversation`. A `409 { conflict: true, holder }` is returned
  when another agent holds the conversation; a `super_admin` may retry with
  `force: true`. Reply `POST` gained the same ownership guard (only the holder,
  or an unassigned conversation, may send).

### UI — `app/admin/(sub)/communication/whatsapp-inbox.tsx` (rewrite)

- **3-pane desktop** (`lg:grid-cols-[320px_1fr_300px]`): list · thread ·
  collapsible details. Below `lg` the list/thread switch (`← Inbox`).
- Filter chips, search (matches name / phone / booking ID / message text),
  per-row unread badge, last-message preview, timestamp, assigned-agent label,
  `Load more` pagination.
- **Bounded polling** — list every 20 s, thread every 12 s; both skip while the
  tab is hidden, and the thread poll skips while a composer field is focused.
  Reply / note / template drafts live in their own state so a refresh never
  clears them; thread scroll position is preserved (stays pinned to the bottom
  only if it was already there).
- Message bubbles are styled and labelled by `kind` (Customer / Agent / Bot /
  Automated); delivery status shown only when provider-confirmed.
- Booking / payment **cards** replace `JSON.stringify`.
- Assign / Take over / Resolve / Return to bot are disabled when the
  conversation is held by another agent; a `super_admin` gets an explicit
  "Take over anyway". Internal notes are clearly marked "never sent".

## Deploy order

1. Stage 2.1 (and P1/P2) already live.
2. **Apply `2026_08_31_whatsapp_admin_inbox.sql` before shipping the code** —
   `PATCH` (takeover/assign/resolve/bot) calls `claim_whatsapp_conversation`
   and returns `500` until the function exists. The other RPCs
   (`bump`/`clear`/`touch`) fail soft (list timestamps just lag).
3. Ship the code. No env-var or Vercel/Meta change.
4. Rollback: revert the component + routes; dropping the four functions and
   three columns reverts the schema (no data migration).

## Tests

- `lib/whatsapp/inbox.test.ts` — sender classification, provider-confirmed
  delivery gate, preview bounding, filter mapping.
- `app/api/admin/whatsapp/conversations/route.test.ts` — unchanged; still
  guards auth on list / detail / PATCH / POST.
- `npm run typecheck:whatsapp`, `npm run test:whatsapp` (171 pass),
  lint on touched files, full `tsc --noEmit`, `next build` — all clean.

## Not in this stage

Secure document/image sending + document cards + composer attachment control
(2.2b). Automatic receipts (2.3). Integration test + deploy runbook (2.4).
