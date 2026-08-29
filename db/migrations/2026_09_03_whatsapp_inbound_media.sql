-- WhatsApp: receive customer documents (master plan §D / Stage 2.5).
--
-- STATUS: NOT APPLIED. Additive / widening only. Review and exercise against
-- isolated staging. Depends on 2026_09_01_whatsapp_media.sql.
--
-- What it does:
--   1. Widens the existing whatsapp_media table to also hold INBOUND
--      (customer-sent) attachments: direction can be 'inbound', the customer
--      has no admin uploader (uploaded_by nullable), DOCX / XLSX are allowed
--      alongside PDF / JPEG / PNG, and the status set gains 'stored' and
--      'quarantined' (content failed validation - kept, not shown, not
--      auto-deleted).
--   2. Adds the WhatsApp-message-id + media-id idempotency boundary so a
--      webhook retry cannot create a duplicate attachment.
--   3. Adds admin review fields: link an attachment to a booking, mark it as
--      payment proof, and record who reviewed it.
--   4. Extends the whatsapp-media bucket's allowed MIME list to match.

BEGIN;

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
     'application/pdf', 'image/jpeg', 'image/png',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
   ]
 WHERE id = 'whatsapp-media';

ALTER TABLE public.whatsapp_media
  DROP CONSTRAINT IF EXISTS whatsapp_media_direction_check;
ALTER TABLE public.whatsapp_media
  ADD CONSTRAINT whatsapp_media_direction_check CHECK (direction IN ('inbound', 'outbound'));

ALTER TABLE public.whatsapp_media
  DROP CONSTRAINT IF EXISTS whatsapp_media_mime_type_check;
ALTER TABLE public.whatsapp_media
  ADD CONSTRAINT whatsapp_media_mime_type_check CHECK (mime_type IN (
    'application/pdf', 'image/jpeg', 'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ));

ALTER TABLE public.whatsapp_media
  DROP CONSTRAINT IF EXISTS whatsapp_media_status_check;
ALTER TABLE public.whatsapp_media
  ADD CONSTRAINT whatsapp_media_status_check CHECK (status IN (
    'pending', 'sending', 'sent', 'failed', 'blocked', 'stored', 'quarantined'
  ));

ALTER TABLE public.whatsapp_media
  DROP CONSTRAINT IF EXISTS whatsapp_media_byte_size_check;
ALTER TABLE public.whatsapp_media
  ADD CONSTRAINT whatsapp_media_byte_size_check CHECK (byte_size >= 0 AND byte_size <= 99614720);

ALTER TABLE public.whatsapp_media
  ALTER COLUMN uploaded_by DROP NOT NULL;

ALTER TABLE public.whatsapp_media
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linked_booking_id TEXT REFERENCES public.bookings(booking_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_payment_proof BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- One stored row per (WhatsApp message, media) — a redelivered webhook is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_media_inbound_provider
  ON public.whatsapp_media (provider_message_id, provider_media_id)
  WHERE direction = 'inbound' AND provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_media_inbound_redrive
  ON public.whatsapp_media (status, updated_at)
  WHERE direction = 'inbound' AND status = 'failed';

COMMIT;

-- Staging verification:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.whatsapp_media'::regclass AND contype = 'c';
--   SELECT column_name, is_nullable FROM information_schema.columns
--    WHERE table_name = 'whatsapp_media'
--      AND column_name IN ('uploaded_by','provider_message_id','linked_booking_id','is_payment_proof');
--   SELECT allowed_mime_types FROM storage.buckets WHERE id = 'whatsapp-media';
