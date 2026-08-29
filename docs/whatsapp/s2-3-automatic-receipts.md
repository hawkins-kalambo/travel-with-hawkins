# WhatsApp Stage 2.3 — automatic receipts after verified payment

Implements master-plan **§D** and the receipt half of **§6**: once a payment is
**verified by PayChangu and durably finalised**, the customer is automatically
sent the canonical PDF receipt on WhatsApp, with a durable outbox so a crash
cannot lose it and a PDF/WhatsApp failure can never undo the payment.

Stacked on Stage 2.2b (reuses its Meta media upload + `document` message path).
Nothing here is committed, deployed, or applied to production yet.

## Trigger — only a finalised payment

`deliverWhatsAppReceipt(txRef)` is called **only** from
`verifyAndFinalizePayment`, **after** `finalize_payment` has committed. A browser
redirect, a customer screenshot, an uploaded file or an "I have paid" message
never reach it — they cannot finalise a payment, and finalisation is the only
caller.

## Delivery flow

`lib/payments/finalize-flow.ts`, after `finalize_payment` succeeds:

1. **`enqueueReceiptDeliveries(txRef)`** — inserts a `payment_receipt_deliveries`
   row (`status = 'pending'`) for every channel with a recipient (`email`,
   `whatsapp`). Committed **before** any send, so a crash here is recoverable.
   Idempotent (`UNIQUE(payment_id, channel)`).
2. Best-effort `emailReceiptForPayment(txRef)` (unchanged path; its claim now
   also reclaims the pre-inserted `pending` row).
3. Best-effort **`deliverWhatsAppReceipt(txRef)`** (replaces the old plain-text
   `notifyWhatsAppPaymentConfirmed` call — the receipt document *is* the
   confirmation):
   - `loadReceiptByTxRef` → the **canonical** `PaymentReceiptRecord` (receipt
     number = `payments.internal_reference`; built deterministically from the
     verified payment + booking).
   - Resolve the **authorised WhatsApp booker** — the number on the booking,
     not the payer/passenger — and skip if that contact has opted out.
   - `claim_payment_receipt_delivery(payment_id, 'whatsapp', waId)` — atomic
     `pending|failed → sending`. A concurrent webhook/callback race or a
     re-drive sees `sending` and returns `already_sent`: **exactly one
     delivery per channel**.
   - **Window check at this moment (§6).** Inside → `getOrCreateReceiptPdf`
     (one immutable object per payment id in the private `payment-receipts`
     bucket — reused by email, WhatsApp and admin download; a later payment
     gets its own id, an earlier receipt is never rewritten) → `uploadWhatsAppMedia`
     → `deliverAttachmentAndRecord` sends a `document` message attributed
     `origin = "automatic"` (records the transcript line; **does not** change
     mode/status/step, so it is safe during a human takeover and never triggers
     a bot reply). Row → `sent` + `provider_message_id`; `bookings.receipt_sent
     = true`.
   - **Outside the window** → row → `blocked` (`outside_window`); the PDF stays
     available to admins; a `409 { blocked: true }`-style outcome is returned;
     the lightweight approved `payment_confirmed` template is attempted as a
     fallback. **The receipt is never reported as sent.**
   - Any PDF / upload / send failure → row → `failed` (never rethrown past this
     boundary). An **ambiguous send timeout** is held as `sending` (not
     `failed`) with `error_message = ambiguous_timeout_*` so it is never
     auto-retried — an admin resolves it.

### Caption

Booking-fee vs fare is stated explicitly; an unassigned booking says transport
is arranged separately; every caption ends "This confirms your payment was
received. It is not a boarding ticket."

## Re-drive (safety net)

`redriveReceiptDeliveries()` runs inside the existing
`/api/cron/whatsapp-recover-events` route (no new `vercel.json` entry). It calls
`due_payment_receipt_deliveries` — `pending`, or `failed` with `attempts < 5` —
and retries each via the same claim-guarded deliverer. `sending` rows (incl.
ambiguous timeouts) and `blocked` rows are **not** auto-retried; `blocked` is
recovered by an admin **Resend**.

## Admin — preview / download / resend

`GET/POST /api/admin/whatsapp/conversations/[id]/receipt`

- `GET ?paymentId=` — streams the stored PDF inline through the admin guard
  (`private, no-store`; no public/signed URL). The payment id is bound to the
  conversation's booker — an id cannot be swapped to reach another customer's
  receipt.
- `POST { paymentId, channel }` — explicit resend: moves a terminal delivery
  row back to `pending`, re-runs the deliverer (double-click-safe via the
  atomic claim), and writes an `audit_logs` row (`resend_payment_receipt`).

The inbox details pane gains a **Receipts** section (per-channel status,
attempts, errors, Open PDF, Resend/Retry). The auto-sent document also appears
in the conversation transcript as a 🧾 card (`origin = automatic`).

## DB — `db/migrations/2026_09_02_whatsapp_receipts.sql` (NOT APPLIED)

- Private `payment-receipts` storage bucket.
- `payment_receipt_deliveries`: `channel` CHECK widened to `('email','whatsapp')`;
  `status` CHECK widened to add `'pending'` and `'blocked'`; new
  `provider_message_id`, `storage_path`, `attempts` columns; re-drive index.
- `enqueue_payment_receipt_delivery`, `claim_payment_receipt_delivery`
  (channel-parametrised), `due_payment_receipt_deliveries`.
  `claim_payment_receipt_email` is kept as a thin wrapper — **the existing
  email receipt path is unchanged**.

Apply order: after `2026_08_07_manual_fare_and_receipt_delivery.sql`. Widening
+ additive. **Apply before shipping** — `enqueue`/`claim`/`due` are called by
finalisation and the cron; without them, receipt delivery degrades quietly
(email path unaffected via the wrapper) and the payment still finalises.

Rollback: revert the code; narrow the two CHECK constraints back; drop the new
columns/functions; remove the bucket.

## Reused, not rebuilt

`receiptGenerator` (canonical PDF), `receipt-service` (`loadReceiptByTxRef`),
the `payment_receipt_deliveries` outbox + claim pattern, `uploadWhatsAppMedia` /
`deliverAttachmentAndRecord` (2.2b), `notifyWhatsAppPaymentConfirmed` (fallback),
the `whatsapp-recover-events` cron.

## Tests

- `lib/whatsapp/receipt-delivery.test.ts` — skipped (no receipt / opted out),
  `already_sent` (claim lost), **`blocked` outside the window** (recorded, not
  "sent"), happy-path `sent`, upload failure → `failed` (no throw), ambiguous
  timeout held as `sending`.
- `app/api/cron/whatsapp-recover-events/route.test.ts` — updated for the
  `receipts` field in the response.
- `npm run test` (91) + `npm run test:whatsapp` (186), `typecheck:whatsapp`,
  full `tsc --noEmit`, lint on touched files, `next build` — all clean.

## Not in this stage

Auto-resend of a `blocked` receipt when the customer reopens the window
(admin Resend is the recovery). Submitting the document-header template.
Integration test + ordered deploy/verify/rollback runbook (Stage 2.4).
