-- Reconciles the Communications Center schema. Three earlier files define
-- incompatible shapes for the same tables:
--   - db/communication_center_migration.sql            ("file A")
--   - db/migrations/communication_center_2026_07_24.sql ("file B")
--   - db/migrations/communication_center_rls_staging.sql ("file C", RLS only)
--
-- A dedicated read-only audit (matching the rigor of docs/ambassador-system-audit.md)
-- confirmed application code (lib/communicationServer.ts and every
-- app/api/communication*/route.ts handler) is built against FILE B's
-- column shapes (communication_messages.body/html/attachments/delivered,
-- free-text communication_announcements.audience) — not file A's
-- (message_type/metadata, audience_scope jsonb). File B is therefore
-- treated as canonical here.
--
-- IMPORTANT — read before running: this migration cannot see your live
-- schema. It is written defensively: every column is added with
-- `ADD COLUMN IF NOT EXISTS`, so it is safe to run whether your database
-- currently has file A's shape, file B's shape, both (if both migrations
-- were run), or neither. It never drops or renames an existing column, and
-- never deletes rows. If your production `communication_messages` table
-- currently has file A's `message_type`/`metadata` columns instead of
-- `body`/`html`/`attachments`, this migration adds the canonical columns
-- alongside them (existing rows will have NULL body/html/attachments) —
-- you will need to backfill those manually if there is real historical
-- message data to preserve; run this first to see what you're working
-- with:
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'communication_messages';
--
-- The only DROP TABLE statements here target `communication_message_recipients`,
-- `communication_announcement_reads`, and `communication_notification_preferences`
-- — confirmed by repo-wide grep to have zero application code references
-- anywhere (dead schema, file-A-only). They are wrapped in a check that
-- refuses to drop if the table has any rows, so real data is never
-- silently destroyed.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- communication_conversations
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_type TEXT NOT NULL DEFAULT 'direct',
    title TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.communication_conversations
    ADD COLUMN IF NOT EXISTS conversation_type TEXT NOT NULL DEFAULT 'direct',
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communication_conversations_type_check') THEN
    ALTER TABLE public.communication_conversations
      ADD CONSTRAINT communication_conversations_type_check
      CHECK (conversation_type IN ('direct', 'group', 'support', 'system'));
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- communication_conversation_participants
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.communication_conversations(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ,
    deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.communication_conversation_participants
    ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Missing from file B (present only in file A) — a user could otherwise be
-- inserted as a duplicate participant of the same conversation.
CREATE UNIQUE INDEX IF NOT EXISTS ux_communication_conversation_participants_unique
    ON public.communication_conversation_participants (conversation_id, profile_id);

-- ---------------------------------------------------------------------
-- communication_messages (canonical shape: file B's body/html/attachments/delivered)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.communication_conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    body TEXT,
    html TEXT,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    delivered BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.communication_messages
    ADD COLUMN IF NOT EXISTS body TEXT,
    ADD COLUMN IF NOT EXISTS html TEXT,
    ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS delivered BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_communication_messages_conversation_id
    ON public.communication_messages (conversation_id, created_at DESC);

-- ---------------------------------------------------------------------
-- communication_message_reads (kept — referenced by file B/C, not yet used
-- by application code, but harmless to have correctly in place for when
-- per-message read receipts are built).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_message_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.communication_messages(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_communication_message_reads_unique
    ON public.communication_message_reads (message_id, profile_id);

-- ---------------------------------------------------------------------
-- communication_notifications
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    priority TEXT NOT NULL DEFAULT 'normal',
    related_type TEXT,
    related_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_status BOOLEAN NOT NULL DEFAULT false,
    archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- file B never had updated_at at all; add it defensively for any
-- environment that only ran file B.
ALTER TABLE public.communication_notifications
    ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS related_type TEXT,
    ADD COLUMN IF NOT EXISTS related_id TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_communication_notifications_profile_id
    ON public.communication_notifications (profile_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_communication_notifications_updated_at ON public.communication_notifications;
CREATE TRIGGER set_communication_notifications_updated_at
BEFORE UPDATE ON public.communication_notifications
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- communication_announcements (canonical: free-text audience, matching
-- file B/application code — only 'everyone' | 'admins' | 'ambassadors'
-- values are ever produced today by the admin composer UI)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    audience TEXT NOT NULL DEFAULT 'everyone',
    pinned BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- published_at/expires_at are read by app/api/communications/route.ts and
-- lib/communicationServer.ts (published_at null == "scheduled, not yet
-- live"); add them defensively for any environment where this table
-- predates those columns.
ALTER TABLE public.communication_announcements
    ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS set_communication_announcements_updated_at ON public.communication_announcements;
CREATE TRIGGER set_communication_announcements_updated_at
BEFORE UPDATE ON public.communication_announcements
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- communication_support_tickets
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'normal',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.communication_support_tickets
    ADD COLUMN IF NOT EXISTS description TEXT;

-- file B declared requester_id NOT NULL with ON DELETE SET NULL — a
-- self-contradictory pair (deleting a profile would try to null out a
-- NOT NULL column and the delete would fail). Fix by switching to CASCADE,
-- consistent with how the rest of this schema treats owned-content rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'communication_support_tickets'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'communication_support_tickets_requester_id_fkey'
  ) THEN
    ALTER TABLE public.communication_support_tickets
      DROP CONSTRAINT communication_support_tickets_requester_id_fkey;
  END IF;
  ALTER TABLE public.communication_support_tickets
    ADD CONSTRAINT communication_support_tickets_requester_id_fkey
    FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
END;
$$;

-- Canonical category values used by the app today, aligned across both
-- admin and ambassador ticket forms (see app/ambassador/communication/page.tsx
-- and app/admin/communication/support-tickets.tsx — the ambassador form's
-- "commissions" option is corrected to "commission" alongside this migration).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communication_support_tickets_category_check') THEN
    ALTER TABLE public.communication_support_tickets
      ADD CONSTRAINT communication_support_tickets_category_check
      CHECK (category IN ('booking', 'commission', 'technical', 'payments', 'general', 'referral', 'account'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_communication_support_tickets_requester_id
    ON public.communication_support_tickets (requester_id);
CREATE INDEX IF NOT EXISTS idx_communication_support_tickets_status
    ON public.communication_support_tickets (status);

DROP TRIGGER IF EXISTS set_communication_support_tickets_updated_at ON public.communication_support_tickets;
CREATE TRIGGER set_communication_support_tickets_updated_at
BEFORE UPDATE ON public.communication_support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- communication_ticket_replies (built out for real — previously dead
-- schema in file A only, with zero application code using it; the
-- accompanying app code change adds the reply feature end-to-end)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communication_ticket_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.communication_support_tickets(id) ON DELETE CASCADE,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communication_ticket_replies_ticket_id
    ON public.communication_ticket_replies (ticket_id, created_at ASC);

-- ---------------------------------------------------------------------
-- Drop confirmed-dead, zero-reference tables (file A only). Refuses to
-- drop if any of them unexpectedly contain rows, so this never destroys
-- real data even if the assumption above turns out to be wrong for your
-- database.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    row_count BIGINT;
BEGIN
    IF to_regclass('public.communication_message_recipients') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM public.communication_message_recipients' INTO row_count;
        IF row_count = 0 THEN
            EXECUTE 'DROP TABLE public.communication_message_recipients';
        ELSE
            RAISE WARNING 'communication_message_recipients has % row(s) — not dropped. Review manually.', row_count;
        END IF;
    END IF;

    IF to_regclass('public.communication_announcement_reads') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM public.communication_announcement_reads' INTO row_count;
        IF row_count = 0 THEN
            EXECUTE 'DROP TABLE public.communication_announcement_reads';
        ELSE
            RAISE WARNING 'communication_announcement_reads has % row(s) — not dropped. Review manually.', row_count;
        END IF;
    END IF;

    IF to_regclass('public.communication_notification_preferences') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM public.communication_notification_preferences' INTO row_count;
        IF row_count = 0 THEN
            EXECUTE 'DROP TABLE public.communication_notification_preferences';
        ELSE
            RAISE WARNING 'communication_notification_preferences has % row(s) — not dropped. Review manually.', row_count;
        END IF;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- RLS — enabled and policies (re)created for every table above, including
-- the three file A left RLS-enabled-with-zero-policies (making them
-- unusable even by their own row owner) and announcement visibility, fixed
-- to compute directly from `audience` rather than file A's backwards
-- "have you already read it" logic.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.communication_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    );
$$;

ALTER TABLE public.communication_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_ticket_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS communication_conversations_admin ON public.communication_conversations;
CREATE POLICY communication_conversations_admin ON public.communication_conversations
FOR ALL TO authenticated USING (public.communication_is_admin()) WITH CHECK (public.communication_is_admin());

DROP POLICY IF EXISTS communication_conversations_participant_select ON public.communication_conversations;
CREATE POLICY communication_conversations_participant_select ON public.communication_conversations
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.communication_conversation_participants cp
        WHERE cp.conversation_id = communication_conversations.id AND cp.profile_id = auth.uid() AND NOT cp.deleted
    )
);

DROP POLICY IF EXISTS communication_participants_admin ON public.communication_conversation_participants;
CREATE POLICY communication_participants_admin ON public.communication_conversation_participants
FOR ALL TO authenticated USING (public.communication_is_admin()) WITH CHECK (public.communication_is_admin());

DROP POLICY IF EXISTS communication_participants_self_select ON public.communication_conversation_participants;
CREATE POLICY communication_participants_self_select ON public.communication_conversation_participants
FOR SELECT TO authenticated USING (profile_id = auth.uid());

DROP POLICY IF EXISTS communication_participants_self_update ON public.communication_conversation_participants;
CREATE POLICY communication_participants_self_update ON public.communication_conversation_participants
FOR UPDATE TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS communication_messages_admin ON public.communication_messages;
CREATE POLICY communication_messages_admin ON public.communication_messages
FOR ALL TO authenticated USING (public.communication_is_admin()) WITH CHECK (public.communication_is_admin());

DROP POLICY IF EXISTS communication_messages_participant ON public.communication_messages;
CREATE POLICY communication_messages_participant ON public.communication_messages
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.communication_conversation_participants cp
        WHERE cp.conversation_id = communication_messages.conversation_id AND cp.profile_id = auth.uid() AND NOT cp.deleted
    )
);

DROP POLICY IF EXISTS communication_messages_participant_insert ON public.communication_messages;
CREATE POLICY communication_messages_participant_insert ON public.communication_messages
FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid() AND EXISTS (
        SELECT 1 FROM public.communication_conversation_participants cp
        WHERE cp.conversation_id = communication_messages.conversation_id AND cp.profile_id = auth.uid() AND NOT cp.deleted
    )
);

DROP POLICY IF EXISTS communication_message_reads_admin ON public.communication_message_reads;
CREATE POLICY communication_message_reads_admin ON public.communication_message_reads
FOR ALL TO authenticated USING (public.communication_is_admin()) WITH CHECK (public.communication_is_admin());

DROP POLICY IF EXISTS communication_message_reads_self ON public.communication_message_reads;
CREATE POLICY communication_message_reads_self ON public.communication_message_reads
FOR ALL TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS communication_notifications_admin ON public.communication_notifications;
CREATE POLICY communication_notifications_admin ON public.communication_notifications
FOR ALL TO authenticated USING (public.communication_is_admin()) WITH CHECK (public.communication_is_admin());

DROP POLICY IF EXISTS communication_notifications_self_select ON public.communication_notifications;
CREATE POLICY communication_notifications_self_select ON public.communication_notifications
FOR SELECT TO authenticated USING (profile_id = auth.uid());

DROP POLICY IF EXISTS communication_notifications_self_update ON public.communication_notifications;
CREATE POLICY communication_notifications_self_update ON public.communication_notifications
FOR UPDATE TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS communication_announcements_admin ON public.communication_announcements;
CREATE POLICY communication_announcements_admin ON public.communication_announcements
FOR ALL TO authenticated USING (public.communication_is_admin()) WITH CHECK (public.communication_is_admin());

-- Audience-based visibility, computed directly (not via a "have you
-- already read it" table like file A's backwards design).
DROP POLICY IF EXISTS communication_announcements_audience_select ON public.communication_announcements;
CREATE POLICY communication_announcements_audience_select ON public.communication_announcements
FOR SELECT TO authenticated USING (
    audience = 'everyone'
    OR (audience = 'admins' AND public.communication_is_admin())
    OR (audience = 'ambassadors' AND EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'ambassador'
    ))
);

DROP POLICY IF EXISTS communication_support_tickets_admin ON public.communication_support_tickets;
CREATE POLICY communication_support_tickets_admin ON public.communication_support_tickets
FOR ALL TO authenticated USING (public.communication_is_admin()) WITH CHECK (public.communication_is_admin());

DROP POLICY IF EXISTS communication_support_tickets_self ON public.communication_support_tickets;
CREATE POLICY communication_support_tickets_self ON public.communication_support_tickets
FOR SELECT TO authenticated USING (requester_id = auth.uid());

DROP POLICY IF EXISTS communication_support_tickets_self_insert ON public.communication_support_tickets;
CREATE POLICY communication_support_tickets_self_insert ON public.communication_support_tickets
FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS communication_ticket_replies_admin ON public.communication_ticket_replies;
CREATE POLICY communication_ticket_replies_admin ON public.communication_ticket_replies
FOR ALL TO authenticated USING (public.communication_is_admin()) WITH CHECK (public.communication_is_admin());

DROP POLICY IF EXISTS communication_ticket_replies_participant ON public.communication_ticket_replies;
CREATE POLICY communication_ticket_replies_participant ON public.communication_ticket_replies
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.communication_support_tickets t
        WHERE t.id = communication_ticket_replies.ticket_id AND t.requester_id = auth.uid()
    )
);

DROP POLICY IF EXISTS communication_ticket_replies_participant_insert ON public.communication_ticket_replies;
CREATE POLICY communication_ticket_replies_participant_insert ON public.communication_ticket_replies
FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid() AND EXISTS (
        SELECT 1 FROM public.communication_support_tickets t
        WHERE t.id = communication_ticket_replies.ticket_id AND t.requester_id = auth.uid()
    )
);

-- Verification (run after applying):
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name LIKE 'communication_%';
--   SELECT policyname, tablename FROM pg_policies WHERE tablename LIKE 'communication_%';
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'communication_messages';
--   -- confirm body/html/attachments/delivered are present; investigate any
--   -- leftover message_type/metadata columns from file A if this table
--   -- previously existed under that shape.
