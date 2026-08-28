# WhatsApp implementation test report

Date: 2026-08-10

## Completed

`npm.cmd run test:whatsapp` passed 17/17 tests. It covered webhook challenge
verification, invalid signatures, malformed signed JSON, feature-disabled
handling, signature verification, text/button/list/status parsing, stable action
IDs, English/Chichewa key completeness, interpolation, global state commands,
English/Chichewa intent recognition, prompt injection, unrelated questions, and
refusal to invent luggage/fare data.

`npm.cmd run typecheck:whatsapp` passed using the scoped configuration in
`tsconfig.whatsapp.json`.

Focused ESLint passed for the WhatsApp libraries, webhook and admin routes,
inbox UI, communication page, and payment finalization integration.

The full pre-change baseline commands did not complete in this environment:

- Full tests timed out after 311 seconds; 20 displayed tests passed first.
- Typecheck timed out after 333 seconds with no diagnostics.
- Lint timed out after 353 seconds with no diagnostics.
- Build timed out after 640 seconds during Turbopack compilation.

During implementation, the full-project typecheck again timed out after 654
seconds with no diagnostics. These full-project timeouts are inconclusive, not
passes; the scoped checks above are the completed verification gates.

## Update — 2026-08-27 (staging-preparation pass)

Changes in this pass: mounted the existing admin WhatsApp inbox tab; added
per-event WABA / phone-number-id validation in the webhook; split webhook-event
processing into an idempotent persistence phase and a non-replayed handling
phase; made the deferred batch process sequentially; converted two
parameter-property constructors so the modules load under `node --test`; added
an additive (unapplied) recovery-selection migration.

- `npm run test:whatsapp` — 33/33 pass (was 17/17). New coverage: WABA /
  phone-number-id capture and `partitionEventsByAccount`; enabled vs disabled
  POST (disabled stores nothing); unexpected account; mixed-account batch;
  status-only event; unconfigured identifiers; already-processed dedupe;
  processor Phase 1 failure -> `failWebhookEvent` (re-claimable); processor
  Phase 2 failure -> `finishWebhookEvent` (not replayed, so no duplicate
  send); rate-limit as a Phase 1 failure; duplicate/no-op claim.
- `npm run typecheck:whatsapp` — passes (exit 0). Scope now also includes
  `app/admin/(sub)/communication/page.tsx` (the inbox mount).
- Focused ESLint over the changed files — see command output in the report.
- Full-project `npm test` / `typecheck` / `lint` / `build` were not run to
  completion here; the earlier timings still stand and are inconclusive, not
  passes. No regression in the WhatsApp-scoped gates.

Not verified in this pass (unchanged from below): anything needing a live
database, real concurrency, or the Meta API. The recovery migration is written
but NOT applied and its behaviour is NOT proven.

## Staging-only tests still requiring infrastructure

- Apply/rollback behavior and RLS role matrix against isolated Supabase.
- Concurrent calls to `create_capacity_checked_booking` at the last seat.
- PayChangu sandbox initialization, abandoned/failed/paid lifecycle.
- Meta test-number delivery/read/failure callbacks.
- Template approval and service-window behavior.
- Deferred-event recovery after a forced function termination, including
  `recover_whatsapp_webhook_events` from the unapplied 2026_08_11 migration and
  the scheduled caller it still needs.

No live Meta message, PayChangu payment, production migration, template
submission, or deployment was performed.
