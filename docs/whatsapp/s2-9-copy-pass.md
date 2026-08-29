# WhatsApp — natural & professional reply copy (Phase J)

A tone/clarity pass over the customer-facing i18n catalogue (`lib/whatsapp/i18n.ts`).
No new keys, no structural change — only string values. All flows and tests
still pass (205).

## Principles applied

- **Short, human, one thing at a time.** Dropped jargon dumps
  (`invalidInput` no longer lists "menu, back, cancel, agent"), trimmed
  developer-ish phrasing ("Automated replies are now paused" →
  "They'll reply here shortly").
- **An example on invalid input.** `invalidTravelDate` now leads with
  "That date didn't look right." and shows `YYYY-MM-DD` + `2026-09-20`.
- **Apologise + give a way out on a backend failure.** `bookingFailed`,
  `paymentFailed`, `systemError`, `routesUnavailable` all open with "Sorry"
  and end with `*menu*` / `*agent*`.
- **Warm, not playful, around money and errors.** `paymentPaid` now says
  "Payment received … Thank you."; error copy stays plain.
- **Consistent terms.** "team member" / "agent" for a human; `trackingResult`
  now shows **Status:** (matching the booking-detail card) instead of
  "Journey:". Keywords the customer can type are wrapped in `*asterisks*` so
  they render bold on WhatsApp.
- **Kept the phrases automated checks and the brief's regression fixture rely
  on**: "no bookings linked", "no published travel dates", "within 24 hours",
  "unpaid reservations", "fare has not been set", "full name", "real future
  date".

## Chichewa

Every reworded EN string has a matching NY rewrite. The NY strings remain on
`chichewaHumanReviewKeys` — **fluent human review still required** before
production, as before.

## Not changed

Message *construction* (which prompt shows when) is unchanged — that is Phase G
(welcome/restart) and Phase K (booking-flow steps). This pass is wording only.

## Tests

`npm run test:whatsapp` (205), `typecheck:whatsapp`, full `tsc`, lint,
`next build` — all green. Existing flow tests already assert on the load-bearing
phrases listed above.
