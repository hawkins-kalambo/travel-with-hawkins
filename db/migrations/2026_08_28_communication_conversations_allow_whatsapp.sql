-- Allow WhatsApp conversations in the shared communication_conversations table.
--
-- lib/whatsapp/repository.ts (ensureConversation) inserts rows with
-- conversation_type = 'whatsapp'. The constraint added by
-- 2026_08_01_reconcile_communication_center.sql
-- (communication_conversations_type_check) only permitted
-- 'direct','group','support','system', so every new WhatsApp conversation
-- INSERT failed and the bot could not create a conversation to reply in.
--
-- Widening a CHECK to a superset cannot invalidate existing rows. Idempotent.
--
-- STATUS: this widening was already applied by hand to the PRODUCTION database
-- on 2026-08-28 to unblock the bot's first replies. This file exists so the
-- change is captured in version control and reproducible in staging / any
-- rebuilt environment. Re-running it against production is a safe no-op; it
-- has NOT been re-applied by this change.

BEGIN;

ALTER TABLE public.communication_conversations
  DROP CONSTRAINT IF EXISTS communication_conversations_type_check;

ALTER TABLE public.communication_conversations
  ADD CONSTRAINT communication_conversations_type_check
  CHECK (conversation_type IN ('direct', 'group', 'support', 'system', 'whatsapp'));

COMMIT;

-- Verification:
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'public.communication_conversations'::regclass
--   AND conname = 'communication_conversations_type_check';
-- Expect the allowed list to include 'whatsapp'.
