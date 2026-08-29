# WhatsApp — SMS alert when a customer requests a human agent

When a WhatsApp customer asks for a human ("agent", the **Talk to an Agent**
menu item, or a booking action that needs an agent), the on-call admin now gets
an **SMS** (and an email if configured), mirroring the existing website-chat
handoff alert.

No new migration. Reuses the existing Africa's Talking SMS integration and
`ADMIN_NOTIFICATION_PHONE`.

## What changed

| File | Change |
| --- | --- |
| `lib/africasTalking.ts` | `sendAdminHandoffAlertSms` gains an optional `channel` (default `"live chat"` — website path unchanged) and `customerName` is now optional. Message: `Travel with Hawkins: <name> needs a human agent on <channel>. <link>` |
| `lib/whatsapp/agent-alerts.ts` (new) | `notifyAdminOfWhatsAppHandoff(conversation)` — one SMS via `sendAdminHandoffAlertSms({ channel: "WhatsApp" })` + an optional admin email. Looks up the contact's `display_name`; falls back to a **masked** number. Both channels fail soft (logged, never thrown). |
| `lib/whatsapp/repository.ts` | `requestHuman` fires `notifyAdminOfWhatsAppHandoff` **once**, only on a genuine new request (previous status `bot_controlled` or `resolved`) — not when the conversation is already `waiting` or an agent already holds it. Wrapped in try/catch so an alert failure never breaks the handoff. |
| `app/admin/(sub)/communication/page.tsx` | passes the existing `?conversation=` deep-link param to the WhatsApp inbox. |
| `app/admin/(sub)/communication/whatsapp-inbox.tsx` | accepts `initialConversationId` and auto-opens that thread, so the SMS/email link (`/admin/communication?tab=whatsapp&conversation=<id>&forceLogin=1`) lands on the right conversation. |

## Trigger points (all go through `requestHuman`)

- global `agent` command mid-flow
- **Talk to an Agent** from the main menu
- `cancel_confirm` → a booking the bot can't cancel itself

De-dup: typing "agent" again while already `waiting`, or after an agent has
taken over, sends **no** further SMS.

## Config (all already used elsewhere — names only)

| Var | Purpose |
| --- | --- |
| `ADMIN_NOTIFICATION_PHONE` | SMS recipient (one fixed Malawi number). Missing → SMS skipped, logged. |
| `AFRICASTALKING_USERNAME`, `AFRICASTALKING_API_KEY` | SMS provider. Missing → skipped. |
| `ADMIN_NOTIFICATION_EMAIL` | optional second channel. Missing → email skipped. |
| `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` | base for the deep link. |

## Tests

`lib/whatsapp/agent-alerts.test.ts` — one SMS tagged `WhatsApp` with a
`forceLogin` deep link; uses `display_name` when present; omits the name
otherwise; a provider throw is swallowed; email only when
`ADMIN_NOTIFICATION_EMAIL` is set.

`npm run test` (91), `npm run test:whatsapp` (191), `typecheck:whatsapp`, full
`tsc`, lint on touched files, `next build` — all green.
