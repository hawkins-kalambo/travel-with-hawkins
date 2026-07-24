-- Communication Center Migration
-- Generated: 2026-07-24
-- WARNING: Review RLS policies below before applying in production.

-- Enable required extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

BEGIN;

-- 1) Conversations
CREATE TABLE IF NOT EXISTS public.communication_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  conversation_type text NOT NULL DEFAULT 'direct', -- direct, group, system
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_communication_conversations_updated_at ON public.communication_conversations(updated_at DESC);

-- 2) Conversation participants
CREATE TABLE IF NOT EXISTS public.communication_conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.communication_conversations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member', -- member, admin, owner
  starred boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  deleted boolean NOT NULL DEFAULT false,
  last_read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_participants_profile ON public.communication_conversation_participants(profile_id);
CREATE INDEX IF NOT EXISTS idx_participants_conversation ON public.communication_conversation_participants(conversation_id);

-- 3) Messages
CREATE TABLE IF NOT EXISTS public.communication_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.communication_conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  body text,
  html text,
  attachments jsonb DEFAULT '[]'::jsonb,
  delivered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.communication_messages(conversation_id, created_at DESC);

-- 4) Read receipts
CREATE TABLE IF NOT EXISTS public.communication_message_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.communication_messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, profile_id)
);

-- 5) Notifications
CREATE TABLE IF NOT EXISTS public.communication_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  priority text NOT NULL DEFAULT 'normal', -- low, normal, high
  read_at timestamptz NULL,
  related_type text NULL,
  related_id text NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_profile_created ON public.communication_notifications(profile_id, created_at DESC);

-- 6) Announcements
CREATE TABLE IF NOT EXISTS public.communication_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'everyone', -- everyone, admins, ambassadors, university:<id>, profiles:[ids]
  pinned boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamptz NULL,
  expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_announcements_published_at ON public.communication_announcements(published_at DESC NULLS LAST);

-- 7) Support tickets
CREATE TABLE IF NOT EXISTS public.communication_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  description text NOT NULL,
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'open', -- open, assigned, in_progress, resolved, closed
  priority text NOT NULL DEFAULT 'normal', -- low, normal, high
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tickets_requester ON public.communication_support_tickets(requester_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.communication_support_tickets(status);

-- 8) Utility function & triggers
CREATE OR REPLACE FUNCTION public.update_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_update_conversation_timestamp ON public.communication_conversations;
CREATE TRIGGER trg_update_conversation_timestamp BEFORE UPDATE ON public.communication_conversations FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
DROP TRIGGER IF EXISTS trg_update_participant_timestamp ON public.communication_conversation_participants;
CREATE TRIGGER trg_update_participant_timestamp BEFORE UPDATE ON public.communication_conversation_participants FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
DROP TRIGGER IF EXISTS trg_update_tickets_timestamp ON public.communication_support_tickets;
CREATE TRIGGER trg_update_tickets_timestamp BEFORE UPDATE ON public.communication_support_tickets FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- 9) Example trigger: notify ticket assignment
CREATE OR REPLACE FUNCTION public.notify_ticket_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.assignee_id IS NOT NULL AND (OLD.assignee_id IS NULL OR OLD.assignee_id <> NEW.assignee_id) THEN
    INSERT INTO public.communication_notifications(profile_id, type, title, message, priority, related_type, related_id)
    VALUES (NEW.assignee_id, 'support_ticket_assigned', 'Ticket assigned', CONCAT('You have been assigned ticket: ', NEW.subject), 'normal', 'support_tickets', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_ticket_assignment ON public.communication_support_tickets;
CREATE TRIGGER trg_notify_ticket_assignment AFTER UPDATE ON public.communication_support_tickets FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_assignment();

COMMIT;

-- ROLLBACK (manual):
-- To rollback, inspect and run the following (will drop communication tables):
-- BEGIN; DROP TABLE IF EXISTS public.communication_message_reads, public.communication_messages, public.communication_conversation_participants, public.communication_conversations, public.communication_notifications, public.communication_announcements, public.communication_support_tickets; COMMIT;

-- IMPORTANT:
-- 1) Do NOT enable RLS on these tables until you have tested policies in staging.
-- 2) Add RLS policies and test with staging users. Example policies are in the accompanying runbook.
