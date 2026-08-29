# WhatsApp — professional welcome, restart & completion (Phase G)

A branded welcome that fires only for a genuinely fresh start, a
"discard your booking in progress?" guard, and a customer-facing message when
an agent hands the conversation back or closes it.

No migration. All customer copy is in the i18n catalogue (EN + NY; the NY
strings are on `chichewaHumanReviewKeys` for fluent review).

## Branded welcome — when it shows

| Trigger | Result |
| --- | --- |
| First-ever language pick (new contact) | `welcomeIntro` + Menu |
| `restart` / "start over" / "reset" | `welcomeIntro` + Menu (after the discard guard, if mid-draft) |
| A conversation an agent had **resolved**, receiving a new message | `welcomeIntro`, then the message is handled at the menu |
| A booking draft that **timed out** (`state_expires_at` passed), next message | `welcomeIntro`, then handled at the menu |
| Plain "menu" / "hi" / "hello" in an active session | **just the Menu** — the welcome is not repeated |
| "Change language" from the menu | short `languageChanged` confirm + Menu |

`welcomeIntro` (EN): *"Welcome to Travel With Hawkins. / I can help you find a
route, make a booking, check your bookings, pay a booking fee or speak to our
team."* — the interactive Menu follows immediately.

WhatsApp platform note: opening a chat sends no webhook, so the bot still
cannot greet before the customer's first message. The "application session"
(transient `state_step` + 30-min `state_expires_at`) stays separate from Meta's
24-hour service window.

## Discard guard

`menu` / `cancel` / `restart` while the customer is **mid-booking with captured
details** (`route_pick` … `booking_review` and the draft has a name / route /
date) → `discard_confirm` step with *"You have a booking in progress. Discard it
and start over?"* and **Confirm / Keep going** buttons.

- **Confirm** → performs the original exit (restart → welcome; cancel →
  "Cancelled"; menu → Menu).
- **Keep going / anything else** → resumes the exact draft step (safe default —
  ambiguous input never loses the draft).
- Asking for an **agent** still goes straight through.

## Agent → customer transition

`app/api/admin/whatsapp/conversations/[id]/route.ts` PATCH, on a successful
**Return to bot** or **Resolve**, now messages the customer **once**, only
inside the 24-hour window (a free-form message outside it would be rejected —
the DB state is reset either way, so their next message triggers a fresh
welcome):

- **Return to bot** → `returnedToBot` ("You're back with our automated
  assistant. How can I help?") + Menu.
- **Resolve** → `resolvedByAgent` ("Our team has closed this conversation.
  Message us any time to start again.")

Sent with `origin = "automatic"` — no mode/status change, no bot reply loop.
A send failure never fails the takeover action.

## New i18n keys (EN + NY)

`welcomeIntro`, `resolvedByAgent`, `draftDiscardPrompt`, `draftKept`,
`keepGoing`; `returnedToBot` reworded.

## Tests

`lib/whatsapp/processor.flows.test.ts` — first language pick → welcome;
resolved reopened → welcome + message still handled; plain "menu" → no welcome
repeat; `restart` → welcome; mid-draft `menu`/`route_date`/`booking_review` →
`discard_confirm`; Confirm discards; Keep going resumes; restart-discard shows
the welcome. The pre-existing "menu/restart from a step" matrix was updated to
the new draft-aware behaviour.

`npm run test:whatsapp` (205), `typecheck:whatsapp`, full `tsc`, lint,
`next build` — all green.

## Not in this stage

Post-booking / post-payment thank-you screens beyond the current held-booking
and payment-confirmed messages (Phase K / J polish).
