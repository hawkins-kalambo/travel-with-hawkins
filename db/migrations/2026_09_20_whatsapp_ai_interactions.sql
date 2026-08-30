-- AI Assistant — Stage 1 foundation: an audit record for every AI-assisted
-- turn. Master plan: "Professional Conversational AI Assistant" §17 / §30.
--
-- STATUS: NOT APPLIED. Additive only. One new table, no changes to existing
-- objects. Safe to run against staging first.
--
-- Every row is written server-side after a turn completes. It captures what
-- the model was asked, what it proposed, what the server allowed, and a
-- redacted preview of the reply — never a secret, never a full provider
-- payload, never another customer's data.

BEGIN;

CREATE TABLE IF NOT EXISTS public.whatsapp_ai_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- whatsapp_conversations is keyed by conversation_id (shared with
  -- communication_conversations). Nullable + SET NULL so an AI record is never
  -- the reason a conversation can't be deleted.
  conversation_id UUID REFERENCES public.whatsapp_conversations(conversation_id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.whatsapp_contacts(id) ON DELETE SET NULL,
  inbound_message_id TEXT,

  -- What the customer said (trimmed, control chars stripped by the writer).
  customer_message TEXT,

  -- The controller's structured read of the turn.
  detected_language TEXT CHECK (detected_language IS NULL OR detected_language IN ('en', 'ny', 'unknown')),
  detected_intent TEXT,
  confidence NUMERIC(4, 3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  entities JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Tool arbitration: what the model wanted vs what the server permitted.
  requested_tool TEXT,
  allowed_tool TEXT,
  tool_outcome TEXT NOT NULL DEFAULT 'none'
    CHECK (tool_outcome IN ('none', 'ok', 'denied', 'error')),

  -- Turn outcome.
  fallback_used BOOLEAN NOT NULL DEFAULT false,
  clarification_requested BOOLEAN NOT NULL DEFAULT false,
  human_requested BOOLEAN NOT NULL DEFAULT false,
  urgency TEXT NOT NULL DEFAULT 'normal'
    CHECK (urgency IN ('normal', 'high', 'urgent')),

  -- A short, secret-free preview of the reply that went out.
  response_preview TEXT,
  response_ms INTEGER CHECK (response_ms IS NULL OR response_ms >= 0),
  model TEXT,

  -- Admin review (§17). feedback also carries the customer's Helpful signal.
  feedback TEXT CHECK (feedback IS NULL OR feedback IN ('helpful', 'needs_help', 'correct', 'needs_improvement', 'unsafe')),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_ai_interactions_conversation
  ON public.whatsapp_ai_interactions (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_ai_interactions_created
  ON public.whatsapp_ai_interactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_ai_interactions_review
  ON public.whatsapp_ai_interactions (feedback, created_at DESC)
  WHERE feedback IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_ai_interactions_intent
  ON public.whatsapp_ai_interactions (detected_intent, created_at DESC);

ALTER TABLE public.whatsapp_ai_interactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_ai_interactions FROM PUBLIC, anon, authenticated;

COMMIT;

-- Staging verification:
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'whatsapp_ai_interactions';
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.whatsapp_ai_interactions'::regclass AND contype = 'c';
--   SELECT count(*) FROM public.whatsapp_ai_interactions;
