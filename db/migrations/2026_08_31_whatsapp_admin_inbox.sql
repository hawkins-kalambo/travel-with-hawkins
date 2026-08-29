-- WhatsApp admin Communication Center inbox (master plan §B / Stage 2.2a).
--
-- STATUS: NOT APPLIED. Additive. Review and exercise against isolated staging
-- before production. Depends on 2026_08_10_whatsapp_customer_service.sql.
--
-- What it does:
--   1. whatsapp_conversations gains cheap list-view fields the inbox needs
--      without a per-row scan of communication_messages:
--        unread_count            - unseen customer messages (agent view)
--        last_customer_message_at - for "waiting longest" ordering
--        last_message_preview     - one-line list preview (either direction)
--   2. bump_whatsapp_unread()  - called when a customer message is recorded.
--      Only accrues unread while a human is (or is being) involved
--      (mode = 'human' OR status IN ('waiting','human_controlled')); a purely
--      bot-served conversation never shows an unread badge.
--   3. clear_whatsapp_unread() - called when an agent opens the thread.
--   4. touch_whatsapp_last_message() - refresh preview/timestamp on an
--      outbound message without touching unread.
--   5. claim_whatsapp_conversation() - ownership-guarded takeover / assign /
--      resolve / return-to-bot done under a row lock, so two agents acting at
--      once cannot silently clobber each other. Returns outcome = 'conflict'
--      (with the current holder) instead of overwriting; the caller may retry
--      with p_force := true for a deliberate reassignment.

BEGIN;

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  ADD COLUMN IF NOT EXISTS last_customer_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_message_preview TEXT;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_unread
  ON public.whatsapp_conversations (unread_count)
  WHERE unread_count > 0;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_whatsapp_unread(
  p_conversation_id UUID, p_preview TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.whatsapp_conversations c
     SET last_message_at = now(),
         last_customer_message_at = now(),
         last_message_preview = left(COALESCE(p_preview, ''), 160),
         unread_count = CASE
           WHEN c.mode = 'human' OR c.status IN ('waiting', 'human_controlled')
           THEN c.unread_count + 1 ELSE c.unread_count END,
         updated_at = now()
   WHERE c.conversation_id = p_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_whatsapp_unread(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_whatsapp_unread(UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_whatsapp_unread(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.whatsapp_conversations c
     SET unread_count = 0, updated_at = now()
   WHERE c.conversation_id = p_conversation_id AND c.unread_count <> 0;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_whatsapp_unread(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_whatsapp_unread(UUID) TO service_role;

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_whatsapp_last_message(
  p_conversation_id UUID, p_preview TEXT
)
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.whatsapp_conversations c
     SET last_message_at = now(),
         last_message_preview = left(COALESCE(p_preview, ''), 160),
         updated_at = now()
   WHERE c.conversation_id = p_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_whatsapp_last_message(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_whatsapp_last_message(UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Ownership-guarded conversation control. p_action:
--   'takeover'  -> mode=human, status=human_controlled, assigned_to=p_actor
--   'assign'    -> as takeover but assigned_to=p_target (must be an admin;
--                  checked by the caller)
--   'resolve'   -> status=resolved
--   'bot'       -> mode=bot, status=bot_controlled, assigned_to=NULL,
--                  state reset to the menu
-- Guard: if the conversation is human_controlled and held by someone other
-- than p_actor, every action except a forced one returns 'conflict'.
CREATE OR REPLACE FUNCTION public.claim_whatsapp_conversation(
  p_conversation_id UUID, p_actor UUID, p_action TEXT,
  p_target UUID DEFAULT NULL, p_force BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(outcome TEXT, mode TEXT, status TEXT, assigned_to UUID)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_row public.whatsapp_conversations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.whatsapp_conversations c
   WHERE c.conversation_id = p_conversation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found', NULL::TEXT, NULL::TEXT, NULL::UUID; RETURN;
  END IF;

  IF NOT p_force
     AND v_row.status = 'human_controlled'
     AND v_row.assigned_to IS NOT NULL
     AND v_row.assigned_to <> p_actor THEN
    RETURN QUERY SELECT 'conflict', v_row.mode, v_row.status, v_row.assigned_to; RETURN;
  END IF;

  IF p_action = 'takeover' THEN
    UPDATE public.whatsapp_conversations c
       SET mode = 'human', status = 'human_controlled', assigned_to = p_actor,
           resolved_at = NULL, updated_at = now()
     WHERE c.conversation_id = p_conversation_id;
  ELSIF p_action = 'assign' THEN
    UPDATE public.whatsapp_conversations c
       SET mode = 'human', status = 'human_controlled', assigned_to = p_target,
           resolved_at = NULL, updated_at = now()
     WHERE c.conversation_id = p_conversation_id;
  ELSIF p_action = 'resolve' THEN
    UPDATE public.whatsapp_conversations c
       SET mode = 'human', status = 'resolved', resolved_at = now(), updated_at = now()
     WHERE c.conversation_id = p_conversation_id;
  ELSIF p_action = 'bot' THEN
    UPDATE public.whatsapp_conversations c
       SET mode = 'bot', status = 'bot_controlled', assigned_to = NULL,
           resolved_at = NULL, state_step = 'menu', state_data = '{}'::jsonb,
           updated_at = now()
     WHERE c.conversation_id = p_conversation_id;
  ELSE
    RETURN QUERY SELECT 'bad_action', v_row.mode, v_row.status, v_row.assigned_to; RETURN;
  END IF;

  SELECT * INTO v_row FROM public.whatsapp_conversations c
   WHERE c.conversation_id = p_conversation_id;
  RETURN QUERY SELECT 'ok', v_row.mode, v_row.status, v_row.assigned_to;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_conversation(UUID, UUID, TEXT, UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_conversation(UUID, UUID, TEXT, UUID, BOOLEAN)
  TO service_role;

COMMIT;

-- Staging verification:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'whatsapp_conversations'
--      AND column_name IN ('unread_count','last_customer_message_at','last_message_preview');
--   SELECT proname FROM pg_proc WHERE proname IN
--    ('bump_whatsapp_unread','clear_whatsapp_unread','touch_whatsapp_last_message',
--     'claim_whatsapp_conversation');
--   -- two-agent guard:
--   SELECT * FROM public.claim_whatsapp_conversation(
--     '<conv>', '<agent-b>', 'takeover');   -- expect outcome='conflict' when held by agent-a
