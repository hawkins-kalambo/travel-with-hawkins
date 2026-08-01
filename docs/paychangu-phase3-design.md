# PayChangu Phase 3 design notes

Written during Phase 3A (foundation only — no API routes exist yet). This
covers two things Phase 3A was asked to design but not build: the webhook
idempotency algorithm (Phase 3C) and how the existing manual payment flow
coexists with PayChangu payments during the transition.

## 1. Webhook idempotency algorithm (for Phase 3C to implement)

### Step-by-step

1. Receive the **raw** request body as bytes/text — never call `req.json()`
   first. The signature is computed over the exact bytes PayChangu sent;
   re-serializing a parsed object is not guaranteed to reproduce the same
   bytes (key order, whitespace, unicode escaping).
2. Read the `Signature` header. Reject if absent.
3. Validate its encoding/length before using it (e.g. it should be a hex
   string of the expected SHA-256 digest length — reject obviously
   malformed values before doing any crypto work on them).
4. Compute `HMAC-SHA256(rawBody, PAYCHANGU_WEBHOOK_SECRET)` using Node's
   `crypto.createHmac("sha256", secret).update(rawBody).digest("hex")`.
5. Compare the computed digest to the header value using
   `crypto.timingSafeEqual` on two equal-length `Buffer`s (guard the length
   check first — `timingSafeEqual` throws on mismatched lengths, and that
   throw itself must not leak timing information beyond "lengths differed",
   which is not sensitive).
6. **Reject invalid signatures before any JSON parsing.** A request that
   fails signature verification gets a generic 4xx and nothing else touches
   the body.
7. Only after the signature is confirmed valid, `JSON.parse` the raw body.
   A parse failure at this point (valid signature, malformed JSON) is
   logged and rejected — PayChangu signing a malformed payload would be
   unexpected, and we should not guess at intent.
8. Derive a **stable provider-event identity** for the idempotency key (see
   "Event identity" below).
9. Insert or atomically claim a `payment_events` row for that identity:
   - `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`
     first. If a row was inserted, this is a new event — proceed.
   - If no row was returned (conflict), `SELECT` the existing row instead.
10. If the existing/claimed row already has `processing_status = 'processed'
    AND processed_at IS NOT NULL`: this event was already fully handled.
    Return **200 immediately**, do nothing else. This is the fast idempotent
    path for a pure retry of a completed event.
11. If the row exists but is `'received'` or `'failed'` (i.e. unfinished or
    previously failed): this is eligible for (re)processing — continue.
12. To prevent two concurrent workers from processing the same event
    (PayChangu retries can arrive close together, or a webhook and a
    manual reconciliation pass could overlap), atomically claim it first:
    ```sql
    UPDATE payment_events
    SET processing_status = 'processing',
        processing_started_at = now(),
        processing_attempts = processing_attempts + 1
    WHERE id = $1 AND processing_status IN ('received', 'failed')
    RETURNING id;
    ```
    If this `UPDATE` affects zero rows, another worker already claimed it
    (or it moved to `processed` between steps 10 and 12) — treat that as
    "someone else has it", return 200, and stop. (A `processing_started_at`
    stuck well past a reasonable timeout is a separate, later reconciliation
    concern — Phase 3A only adds the column and its partial index for that;
    the sweep itself is out of scope here.)
13. Call `GET /verify-payment/{tx_ref}` (`lib/payments/paychangu-client.ts`).
    The webhook payload's own claimed status is never trusted on its own —
    this call is what actually determines truth.
14. Run the result through `validatePayChanguVerification`
    (`lib/payments/verification-validator.ts`) against the local `payments`
    row loaded by `tx_ref`. This checks tx_ref, status, currency, and exact
    amount as already implemented and tested in Phase 3A.
15. If `outcome === "valid"` or `"already_finalized"`, call
    `finalize_payment(...)` (the RPC from Phase 3A), passing this event's
    `payment_events.id` as `p_payment_event_id` so the RPC marks it
    `processed` atomically with the payment/booking update — never as a
    separate follow-up write.
16. The RPC only marks the event `processed` when its own transaction
    (payment update + booking update + event update) commits successfully.
    If `finalize_payment` itself fails unexpectedly (DB error, not a
    business rejection), the event stays claimed at `processing_status =
    'processing'` from step 12's perspective within *this* transaction — but
    since the whole call is one statement, a hard failure there rolls back
    the claim too. The webhook route must catch that, then explicitly set
    `processing_status = 'failed'`, `last_error_at = now()`, `last_error =
    <short code>` in a **separate** follow-up update (this one is allowed to
    be non-transactional with the RPC, since the RPC's failure already
    means nothing else committed).
17. If `outcome === "pending"` (payment not yet successful) or `"rejected"`
    (validation failed — mismatch, unknown tx_ref, etc.), do not call the
    RPC. Mark the event `failed` with a short `last_error` reason
    (`"pending"` or the validator's `reason` string) so a later delivery or
    manual reconciliation can retry it. This is retryable, not a permanent
    dead-letter — Phase 3A intentionally does not add a separate terminal
    "permanently failed" state; capping retries (via `processing_attempts`)
    is an application-layer decision for whoever builds the retry worker.
18. Return **200** for: newly completed events, and replays of already-
    completed events. Return a **non-2xx** (e.g. 500 or 503) for retryable
    internal failures (DB unreachable, PayChangu verify call errored/timed
    out) so PayChangu's own webhook retry mechanism has a chance to redeliver.
    Return a **4xx** for validation rejections that are not going to become
    valid on retry (bad signature, unknown tx_ref) — retrying those wastes
    PayChangu's redelivery budget on something that will never succeed.
19. **A booking is never marked paid from the webhook body's `status`
    field alone.** Every path to `finalize_payment` passes through
    `verifyPayChanguTransaction` + `validatePayChanguVerification` first.
20. The browser return/callback route (Phase 3B/3C) follows the identical
    verify → validate → finalize path. It is not a second, weaker way to
    mark something paid — it's the same three functions, just triggered by
    a redirect instead of a POST. This is why `finalize_payment` is built
    to be safe under concurrent callers: the webhook and the callback for
    the same payment may genuinely race.

### Event identity (idempotency key derivation)

**Why not just `paychangu:{tx_ref}:{event_type}`:** a single `tx_ref` can
plausibly have more than one legitimate event of the same `event_type` over
its lifecycle — PayChangu's webhook docs don't rule this out, and payment
providers in general commonly reuse a checkout-session-level reference
across retried charge attempts. Keying only on `tx_ref` + `event_type`
would make a second, genuinely different event with the same pair look
identical to a redelivery of the first, and it would be silently dropped
instead of processed.

**What Phase 3C should use instead**, in priority order:

1. `paychangu:{event_type}:{charge_id}` — if the payload includes
   `charge_id` (present in PayChangu's documented webhook example), this is
   the best candidate for a provider-issued identifier scoped to the
   specific charge, not just the checkout session.
2. `paychangu:{event_type}:{reference}` — fallback if `charge_id` is absent
   but `reference` is present (also seen in the documented example; it's
   unclear from PayChangu's docs whether `reference` and `charge_id` are
   always the same value or can differ, so both are treated as candidates
   rather than assumed identical).
3. `paychangu:{event_type}:{tx_ref}` — fallback if neither of the above is
   present. This reintroduces the collision risk described above, but only
   as a last resort when the provider gives us nothing better.
4. `paychangu:{event_type}:sha256({stable authenticated fields})` — if
   even `tx_ref` is somehow absent (shouldn't happen for a payment event,
   but the code must not assume), hash a small set of fields that are
   already known to be authentic at this point in the algorithm (i.e.
   fields from the payload **after** signature verification has passed) —
   e.g. `status + currency + amount + created_at`, if present. This is a
   deterministic fallback, not a random one, so true redeliveries of the
   exact same event still hash to the same key.

**The real safety net is not the idempotency key.** Even in the worst case
— the key generation imperfectly collapses two different events, or fails
to collapse two redeliveries of the same event — `finalize_payment` is
independently idempotent, keyed on the *payment's own stored status*, not
on the event row. A second `finalize_payment` call for a tx_ref already
`paid` always returns `already_finalized` (or `rejected` if the replay is
contradictory) and never re-applies the booking update. The idempotency key
is an efficiency/traceability layer — it avoids redundant PayChangu verify
calls and gives a clean audit trail in `payment_events` — but it is not the
only thing standing between a duplicate webhook delivery and a duplicate
charge being applied twice.

## 2. Legacy payment-flow compatibility

### What exists today

- `bookings.payment_status` (`Pending` / `Payment Confirmed` / `Failed`,
  free text, not CHECK-constrained) is the field the admin dashboard
  (`app/admin/page.tsx`) reads for its revenue totals, status badges, and
  the "Confirm Payment" button, and the field `POST /api/payments/confirm`
  writes.
- `POST /api/payments/confirm` (admin-only) is today's *entire* payment
  confirmation mechanism: an admin manually flips `payment_status` to
  `Payment Confirmed`, sets `payment_confirmed_at`, and generates a
  sequential `RCP-YYYY-######` receipt number — there is no gateway
  involved. This models "we received money for this booking, some way,
  outside the app" as a single yes/no fact.
- `POST /api/payments/send-receipt` (admin-only) emails a PDF receipt,
  gated on `payment_status === "Payment Confirmed"`, and sets
  `bookings.receipt_sent = true`.
- None of the above reads or writes `booking_fee_status` or `fare_status`
  (added in Phase 1/2) at all. The two systems are currently fully
  disconnected.

### Why they must not be merged automatically

Paying the booking fee does not mean the transport fare is paid — that's
the entire reason the schema separates them (Phase 1). The legacy
`payment_status` field has no way to represent "fee paid, fare still
outstanding" — it's a single combined flag. If `finalize_payment` (or
anything else) wrote to `payment_status` whenever a `booking_fee` payment
succeeds, the admin dashboard would show a booking as fully
`Payment Confirmed` — and therefore eligible for a receipt, and counted as
confirmed revenue — based on the fee alone, which is exactly the
contradictory state Phase 1 was built to prevent.

**Decision for Phase 3A/3B: `finalize_payment` does not touch
`payment_status`, `payment_confirmed_at`, `receipt_number`, or
`receipt_sent` at all** (confirmed in the RPC's implementation — it only
ever updates `booking_fee_status`/`booking_fee_paid_at` or
`fare_status`/`fare_payment_method`/`fare_paid_at`, per `payment_type`).
The legacy admin "Confirm Payment" flow keeps working exactly as it does
today, completely independently, for as long as it exists.

### Where this leaves things during the transition

- A booking can now legitimately be in a state the admin dashboard doesn't
  visualize yet: `booking_fee_status = 'paid'` (via PayChangu, once Phase
  3B/3C ship) while `payment_status` still shows `Pending`. This is correct
  data, not a bug — but it means the admin dashboard will need a Phase-3D-ish
  update to surface `booking_fee_status`/`fare_status` directly instead of
  (or alongside) `payment_status`, so staff aren't misled by a `Pending`
  badge on a booking whose fee is actually paid. That UI work is explicitly
  out of scope for Phase 3A and is not touched here.
- Nothing in Phase 3A changes what `/api/payments/confirm` or
  `/api/payments/send-receipt` do. No minimal safety patch was necessary
  for Phase 3A specifically, because Phase 3A introduces no live endpoint
  that could interact with them yet — `finalize_payment` exists in the
  database but nothing calls it. The risk described above (contradictory
  states) becomes live only once Phase 3B/3C wire up real payment
  initiation and webhook/callback routes, at which point this document's
  "does not touch legacy fields" rule is what prevents it.
- Before Phase 3B ships receipts/notifications for PayChangu payments, a
  decision is needed on whether a *fully* paid booking (both
  `booking_fee_status = 'paid'` and `fare_status = 'paid'`) should also
  flip `payment_status` to `Payment Confirmed` for admin-dashboard/legacy
  reporting continuity, or whether the dashboard should be updated to stop
  depending on `payment_status` altogether. Recording this as an open
  question rather than deciding it here, since it affects receipt/
  notification behavior which Phase 3A is explicitly not implementing.
