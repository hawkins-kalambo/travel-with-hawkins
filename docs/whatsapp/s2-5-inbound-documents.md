# WhatsApp Stage 2.5 — receive customer documents

Implements master-plan **§D / Phase D**: a WhatsApp customer can send a
**document or image** (payment evidence, ID, etc.); it is downloaded from Meta,
validated by its actual bytes, stored **privately**, shown in the admin
conversation, and can be linked to a booking or flagged as payment proof.

Stacked on Stage 2.3. Reuses the private `whatsapp-media` bucket and the
`whatsapp_media` table from Stage 2.2b. Nothing here is committed, deployed, or
applied to production yet.

## Flow

1. **Webhook parse** (`lib/whatsapp/parser.ts`) — `type: "document" | "image"`
   messages now yield `inputType` `document`/`image` and a `media`
   `{ id, mimeType, filename?, caption?, sha256? }`. The signature is already
   verified before any of this runs. A media node with no `id` degrades to
   `unknown` (no crash).
2. **`recordInbound`** stores the transcript line as today, then — off the
   critical path, wrapped so it can never fail the text persistence — calls
   `ingestInboundMedia`.
3. **`ingestInboundMedia`** (`lib/whatsapp/inbound-media.ts`):
   - **Idempotent** on `(provider_message_id, provider_media_id)` — a
     redelivered webhook is a no-op.
   - Declared type must be on the inbound whitelist (**PDF, JPEG, PNG, DOCX,
     XLSX**); anything else (executables, archives, audio, video) is logged and
     dropped — the text placeholder still shows the customer sent something.
   - Inserts a `pending` `whatsapp_media` row (`direction = 'inbound'`,
     `uploaded_by = NULL`), then `downloadWhatsAppMedia` (media-id → temporary
     Meta URL → bytes, both calls bearer-authed, size-capped **before**
     buffering).
   - **`validateInboundMediaBytes`** sniffs the magic bytes: PDF/JPEG/PNG must
     match exactly; DOCX/XLSX must be a ZIP/OOXML container (`PK\x03\x04`) — a
     `.docx` that is really an `.exe` is rejected. Bad content → row
     `quarantined` (kept, not shown, not auto-deleted).
   - Uploads to `whatsapp-media/inbound/<conversation>/<uuid>.<ext>`, records
     `sha256`, sets row `stored`, and backfills the transcript message's
     `attachments` so the bubble renders a 📎 card.
   - Any download/storage error → row `failed` + `attempts++`; **never
     thrown**. A re-drive in the `whatsapp-recover-events` cron retries
     `failed` inbound rows under `attempts < 5`.

## Admin

- The received file shows in the transcript (📎 **Open**) and in a new
  **Files received** panel with size, caption, status
  (`stored` / `quarantined` / `failed`), a **Link to booking** dropdown (only
  the conversation's own bookings), and a **payment proof** checkbox. The
  reviewing admin + time are recorded.
- Download is the same authenticated stream as Stage 2.2b — **no public or
  signed read URL**; the media id is bound to the conversation in the path.
- `PATCH /api/admin/whatsapp/conversations/[id]/media` — `{ mediaId,
  linkedBookingId?, isPaymentProof? }`, inbound-only, ownership-guarded.

## DB — `db/migrations/2026_09_03_whatsapp_inbound_media.sql` (NOT APPLIED)

Widens `whatsapp_media`:
- `direction` CHECK → `('inbound','outbound')`; `mime_type` CHECK → + DOCX/XLSX;
  `status` CHECK → + `stored`, `quarantined`; `byte_size` CHECK → `>= 0`
  (pending rows); `uploaded_by` → nullable.
- new: `provider_message_id`, `provider_sha256`, `attempts`,
  `linked_booking_id` (FK `bookings`), `is_payment_proof`, `reviewed_by`,
  `reviewed_at`.
- unique index `(provider_message_id, provider_media_id) WHERE direction =
  'inbound'` (idempotency); partial index for the re-drive.
- `storage.buckets` `allowed_mime_types` for `whatsapp-media` extended to the
  5 types.

Apply order: after `2026_09_01_whatsapp_media.sql`. Widening + additive.
**Apply before shipping** — the parser/ingest path 500s on the missing
columns/CHECK; the rest of the inbox is unaffected. If your project blocks
`storage.buckets` writes, edit the bucket's allowed MIME types in the Supabase
dashboard instead.

Rollback: revert the code; narrow the CHECKs; drop the new columns/indexes;
reset the bucket's `allowed_mime_types`.

## Env (name only, optional)

| Var | Default | Purpose |
| --- | --- | --- |
| `WHATSAPP_INBOUND_MEDIA_MAX_MB` | `10` | inbound size cap (capped at 95). |

## Tests

- `lib/whatsapp/parser.test.ts` — document + image parsing, missing-media-id
  fallback.
- `lib/whatsapp/media.test.ts` — `sniffInboundContainer`,
  `validateInboundMediaBytes` (DOCX-as-zip accepted, fake PDF rejected,
  exact magic bytes for PDF/JPEG/PNG).
- `lib/whatsapp/inbound-media.test.ts` — unsupported type dropped, idempotent
  no-op, happy path → `stored` + attachment backfill, bad bytes → `quarantined`,
  download/storage failure → `failed` (+attempts) without throwing.
- `app/api/cron/whatsapp-recover-events/route.test.ts` — `media` in the response.
- `npm run test` (91), `npm run test:whatsapp` (204), `typecheck:whatsapp`,
  full `tsc`, lint, `next build` — all green.

## Not in this stage

Audio/video inbound (design is extensible; not wired). Malware scanning beyond
magic-byte validation (quarantine state + documented limitation, per the
brief). AI inspection of attachments (explicitly out of scope).
