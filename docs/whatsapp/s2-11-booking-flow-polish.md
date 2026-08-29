# WhatsApp — booking-flow polish (Phase K leftovers)

Three small gaps from master-plan §14 / §5.4, closed. No migration.

## 1. Edit from the review screen (§14.1 step 7)

The review confirm prompt now offers **Confirm / Edit / Cancel** (was Confirm /
Cancel). **Edit** is `flow_back` → the existing global "back" command steps to
the previous question (`booking_review` → `booking_student_id` → … →
`booking_name`), keeping every captured field. The customer answers the one
field they want to change and returns to the review — no full restart.

- `messages.ts`: `reviewConfirmMessage(language, summary)` (3 buttons); the
  `booking_student_id` handler now sends it instead of `confirmPromptMessage`.
- `booking_review` still confirms only on an explicit affirmative; a non-Edit,
  non-affirmative reply cancels.
- The mid-draft discard guard (Phase G) was narrowed to **menu / restart**
  only, so "Cancel" at the review is a direct cancel — no double "discard?"
  prompt.

## 2. My Bookings "Show more" (§5.4)

WhatsApp lists cap at 10 rows. When a contact owns more:

- `bookingsListMessage(language, items, offset)` shows 9 bookings + a
  **`bk:more`** row ("Show more · N more").
- The `my_bookings` handler on `bk:more` re-reads the list, advances
  `state_data.myBookingsOffset` by 9, and re-sends the next page.
- `listWhatsAppBookings` now fetches up to **30** (was 15). All booking states
  are still included (active, awaiting payment, assigned, completed, cancelled).

## 3. "Book another passenger" (§14.1 step 10)

Covered by the existing flow: every held-booking message is followed by the
main menu, whose **Make a Booking** starts a fresh one-passenger booking for
the same WhatsApp owner (the ownership link is per-booking, so the same number
can hold several). No separate action added — it would duplicate the menu.

## Tests

`lib/whatsapp/processor.flows.test.ts` — review prompt has
`flow_confirm / flow_back / flow_cancel`; Edit steps back keeping the draft
(no booking call); >10 bookings → 10th row is `bk:more`, and `bk:more` pages to
`myBookingsOffset: 9` with the remaining rows.

`npm run test:whatsapp` (208), `typecheck:whatsapp`, full `tsc`, lint,
`next build` — all green.
