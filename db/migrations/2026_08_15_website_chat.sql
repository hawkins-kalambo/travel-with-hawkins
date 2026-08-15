-- Public homepage chat widget: anonymous visitors chat with a small
-- deterministic FAQ bot, which can hand off to a human agent through the
-- existing communication_conversations/communication_messages tables.
-- Modeled directly on the WhatsApp foundation in
-- 2026_08_10_whatsapp_customer_service.sql (same contact + satellite
-- conversation-state shape), swapping wa_id identity for a session-token
-- cookie since there's no phone number here.
-- Additive only. Review and exercise against staging; do not apply directly
-- to production.

BEGIN;

CREATE TABLE IF NOT EXISTS public.website_chat_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    phone TEXT,
    email TEXT,
    customer_id UUID REFERENCES public.customer_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.website_chat_conversations (
    conversation_id UUID PRIMARY KEY REFERENCES public.communication_conversations(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.website_chat_contacts(id) ON DELETE RESTRICT,
    mode TEXT NOT NULL DEFAULT 'bot' CHECK (mode IN ('bot', 'human')),
    status TEXT NOT NULL DEFAULT 'bot_controlled'
        CHECK (status IN ('bot_controlled', 'waiting', 'human_controlled', 'resolved')),
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (contact_id)
);

CREATE INDEX IF NOT EXISTS idx_website_chat_conversations_queue
    ON public.website_chat_conversations (status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_chat_conversations_assignee
    ON public.website_chat_conversations (assigned_to, status);

-- communication_messages already grew channel/direction/visibility/
-- message_kind/external_sender_id (that last one FK'd specifically to
-- whatsapp_contacts) in the WhatsApp migration. Website chat reuses the same
-- table with channel = 'website', but needs its own FK for a non-WhatsApp
-- external sender.
ALTER TABLE public.communication_messages
    ADD COLUMN IF NOT EXISTS website_sender_id UUID REFERENCES public.website_chat_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_communication_messages_website_transcript
    ON public.communication_messages (conversation_id, created_at) WHERE channel = 'website';

ALTER TABLE public.website_chat_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_chat_conversations ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated RLS policies, deliberately: every access path (the
-- public widget's API routes and the admin inbox) goes through
-- supabaseAdmin (service role) server-side, same as the WhatsApp tables.
-- RLS is enabled so a future accidental client-side query fails closed
-- instead of silently exposing every visitor's chat to every other visitor.

COMMIT;

-- Staging verification:
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname LIKE 'website_chat_%';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'communication_messages' AND column_name = 'website_sender_id';
