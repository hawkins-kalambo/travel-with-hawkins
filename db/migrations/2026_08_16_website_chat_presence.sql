-- Live presence for the website chat widget: lets a customer see when the
-- human agent who took over their conversation is actively online, when
-- they're typing a reply, and when they were last seen if not currently
-- online. Additive only — two nullable timestamp columns on the existing
-- website_chat_conversations table (2026_08_15_website_chat.sql).
-- Review and exercise against staging; do not apply directly to production.

BEGIN;

ALTER TABLE public.website_chat_conversations
    ADD COLUMN IF NOT EXISTS admin_last_seen_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS admin_typing_at TIMESTAMPTZ;

COMMIT;

-- Staging verification:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'website_chat_conversations' AND column_name IN ('admin_last_seen_at', 'admin_typing_at');
