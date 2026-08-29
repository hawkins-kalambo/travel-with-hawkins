-- WhatsApp admin outbound attachments (master plan §C / Stage 2.2b).
--
-- STATUS: NOT APPLIED. Additive. Review and exercise against isolated staging
-- before production. Depends on 2026_08_10_whatsapp_customer_service.sql.
--
-- What it does:
--   1. Private storage bucket 'whatsapp-media' (public = false). No storage
--      RLS policies are added, so anon/authenticated cannot read or write it;
--      the API uses the service-role key (which bypasses storage RLS) and the
--      client only ever gets a short-lived, single-path signed UPLOAD url.
--      Downloads are streamed through an authenticated admin route — never a
--      public or signed read url.
--   2. whatsapp_media - one row per admin attachment. Bound to BOTH the
--      conversation and the recipient contact so a request cannot swap an id
--      to reach another customer's file. status tracks the send lifecycle,
--      including 'blocked' (outside the 24h window with no usable template)
--      which must never be reported to the agent as "sent".
--   3. claim_whatsapp_media_send() - flips a row to 'sending' atomically so a
--      double-clicked Send / Resend cannot dispatch the same file twice.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media', 'whatsapp-media', false, 99614720,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.whatsapp_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.communication_conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.whatsapp_contacts(id) ON DELETE RESTRICT,
  message_id UUID REFERENCES public.communication_messages(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction = 'outbound'),
  kind TEXT NOT NULL CHECK (kind IN ('document', 'image')),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  file_name TEXT NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 240),
  byte_size BIGINT NOT NULL CHECK (byte_size > 0 AND byte_size <= 99614720),
  sha256 TEXT CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  storage_path TEXT NOT NULL,
  provider_media_id TEXT,
  caption TEXT CHECK (caption IS NULL OR length(caption) <= 1024),
  template_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'blocked')),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 120),
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_media_conversation
  ON public.whatsapp_media (conversation_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_media_storage_path
  ON public.whatsapp_media (storage_path);

ALTER TABLE public.whatsapp_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_media FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Atomic guard against a double-send. A row can enter 'sending' only from a
-- non-terminal state; 'sent' can never be re-dispatched.
CREATE OR REPLACE FUNCTION public.claim_whatsapp_media_send(p_media_id UUID)
RETURNS TABLE(claimed BOOLEAN, status TEXT)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_row public.whatsapp_media%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.whatsapp_media m WHERE m.id = p_media_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::TEXT; RETURN;
  END IF;
  IF v_row.status NOT IN ('pending', 'failed', 'blocked') THEN
    RETURN QUERY SELECT false, v_row.status; RETURN;
  END IF;
  UPDATE public.whatsapp_media m
     SET status = 'sending', error_code = NULL, updated_at = now()
   WHERE m.id = p_media_id;
  RETURN QUERY SELECT true, 'sending'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_media_send(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_media_send(UUID) TO service_role;

COMMIT;

-- Staging verification:
--   SELECT id, public FROM storage.buckets WHERE id = 'whatsapp-media';   -- public = false
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'whatsapp_media'; -- true
--   SELECT proname FROM pg_proc WHERE proname = 'claim_whatsapp_media_send';
--   -- double-send guard:
--   SELECT * FROM public.claim_whatsapp_media_send('<row>');  -- claimed = true
--   SELECT * FROM public.claim_whatsapp_media_send('<row>');  -- claimed = false, status = 'sending'
