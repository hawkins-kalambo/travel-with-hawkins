# WhatsApp Stage 2.2b — secure document / image sending

Implements master-plan **§C** and the media half of **§6**: an agent can send a
**PDF, JPEG or PNG** to a WhatsApp customer from the Communication Center inbox,
with private storage, server-side content validation, and window/template
handling.

Stacked on Stage 2.2a. Nothing here is committed, deployed, or applied to
production yet.

## Flow (three steps, bytes never touch our function)

1. **`POST /api/admin/whatsapp/conversations/[id]/media`** `{ fileName, mimeType, byteSize }`
   → auth admin + conversation must be `human` and owned by the caller
   → `validateMediaClaim` (declared type on the whitelist, size within the
   per-kind ceiling) → inserts a `whatsapp_media` row (`status = 'pending'`,
   bound to `conversation_id` **and** `contact_id`) → returns a **single-path,
   short-lived signed UPLOAD url** from Supabase Storage.
2. Client **`PUT`s the raw bytes to that signed url** (direct to storage — no
   Vercel 4.5 MB body limit, large PDFs fine).
3. **`PUT /api/admin/whatsapp/conversations/[id]/media`** `{ mediaId, caption? }`
   → re-checks ownership → downloads the stored bytes →
   **`validateMediaBytes` sniffs the magic bytes** (`%PDF-`, `FF D8 FF`,
   `89 50 4E 47 …`); a declared-type/content mismatch is rejected outright →
   records `sha256` → **checks the 24-hour window at this moment** →
   `claim_whatsapp_media_send` (atomic `pending|failed|blocked → sending`, so a
   double-click cannot send twice) → `uploadWhatsAppMedia` to Meta's media
   endpoint → `deliverAttachmentAndRecord` sends a `document` / `image` message
   and writes the transcript line with an `attachments` descriptor →
   `whatsapp_media` → `status = 'sent'`, `provider_media_id`, `message_id`.

**`GET …/media?mediaId=`** streams the file back inline through the
admin-guarded route (`Cache-Control: private, no-store`, `X-Content-Type-Options:
nosniff`) — **no public url, no signed READ url** is ever exposed, and the id is
bound to the conversation in the path.

**`DELETE …/media?mediaId=`** removes a `pending` / `failed` / `blocked` upload
(composer "remove", or clearing a failed attempt). A `sent` / `sending` row
cannot be removed.

## Window / template handling (§6)

The window is checked at **actual send time** (step 3), not when the file was
picked; an outgoing message does not reopen it.

- **Inside the window** → the `document` / `image` message is sent.
- **Outside the window** → sending media needs an approved **utility template
  with a media header**. None is wired up at launch, so the row is set to
  `status = 'blocked'` (`error_code = 'outside_window'`), the file is kept, and
  the API returns `409 { blocked: true, error: <actionable text> }`. The agent
  is told to ask the customer to message first, then resend within the window.
  **The file is never reported as sent.** Template wording is drafted in
  `docs/whatsapp/message-template-drafts.md` (`agent_document` / `agent_image`)
  — **not submitted**; `payloadFor` would also need a media-header component
  before that path can work.

## What changed

| File | Change |
| --- | --- |
| `lib/whatsapp/types.ts` | `WhatsAppOutboundMessage` gains `document` / `image` variants (reference a Meta media id — never a URL) |
| `lib/whatsapp/client.ts` | `payloadFor` builds document/image payloads; new `uploadWhatsAppMedia(bytes, mime, name)` → media id (30 s timeout, no retry) |
| `lib/whatsapp/media.ts` (new, pure, unit-tested) | whitelist (`application/pdf`, `image/jpeg`, `image/png`), per-kind size ceilings (`WHATSAPP_MEDIA_MAX_DOC_MB`, default 16 MB; images fixed 5 MB), `sniffMediaType`, `sanitizeFilename`, `validateMediaBytes`, `validateMediaClaim` |
| `lib/whatsapp/repository.ts` | `deliverAttachmentAndRecord` — records the transcript line with an `attachments` descriptor and returns the message id for the `whatsapp_media` link |
| `lib/whatsapp/messages.ts` | `messageText` renders `[document: name]` / `[image]` previews |
| `app/api/admin/whatsapp/conversations/[id]/media/route.ts` (new) | `POST` / `PUT` / `GET` / `DELETE` as above |
| `app/api/admin/whatsapp/conversations/[id]/route.ts` | detail response carries a `media` list |
| `app/admin/(sub)/communication/whatsapp-inbox.tsx` | composer attach control (pick → chip with size → remove → Send file → progress line), transcript cards with an **Open** action, a "Files sent" section in the details pane with status + **Resend** (failed/blocked only) + **Discard** |

## DB — `db/migrations/2026_09_01_whatsapp_media.sql` (NOT APPLIED)

- Private storage bucket `whatsapp-media` (`public = false`, 95 MB limit,
  mime allow-list). **No storage RLS policies** are added → anon / authenticated
  cannot read or write it; the API uses the service-role key and only ever
  hands the client a scoped signed **upload** url.
- `whatsapp_media` table — one row per outbound attachment, bound to the
  conversation and the recipient contact; `status IN (pending, sending, sent,
  failed, blocked)`; RLS enabled, revoked from anon / authenticated.
- `claim_whatsapp_media_send(media_id)` — atomic `pending|failed|blocked →
  sending` guard against a double-clicked Send / Resend.

Apply order: after `2026_08_10_whatsapp_customer_service.sql`. Additive.
**Apply before shipping the code** — the `POST`/`PUT` media routes 500 without
the table / bucket / function. The rest of the inbox is unaffected.

Rollback: revert the routes + component; `DROP TABLE whatsapp_media`,
`DROP FUNCTION claim_whatsapp_media_send`, and remove the bucket (delete its
objects first).

## Env

| Var | Default | Purpose |
| --- | --- | --- |
| `WHATSAPP_MEDIA_MAX_DOC_MB` | `16` | PDF size ceiling (capped at 95). Images are fixed at Meta's 5 MB. |

No Vercel or Meta setting changes. Groq activation unchanged.

## Tests

- `lib/whatsapp/media.test.ts` — magic-byte sniffing (incl. rejecting an `MZ`
  disguised as `.pdf`), filename sanitisation (path traversal, control chars,
  forced extension), size ceilings, claim vs bytes validation.
- `npm run typecheck:whatsapp`, `npm run test:whatsapp` (179 pass), lint on
  touched files, full `tsc --noEmit`, `next build` — all clean.

## Not in this stage

Inbound media (customer-sent files). Automatic receipts (2.3). Integration test
+ deploy runbook (2.4). Submitting the document-header templates or wiring the
media-header component (needs approval).
