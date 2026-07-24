-- RLS policies for Communication Center (staging)
-- Generated: 2026-07-24
-- Apply these policies in staging only after migration has been applied.

-- Helper: check admin role
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (lower(role) = 'admin' OR lower(role) = 'super_admin'));
$$;

-- Enable RLS on client-facing tables
ALTER TABLE public.communication_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_support_tickets ENABLE ROW LEVEL SECURITY;

-- communication_notifications
CREATE POLICY "select_notifications_owner_or_admin" ON public.communication_notifications
  FOR SELECT USING (profile_id = auth.uid() OR public.is_admin());

-- Prevent client-side creation of notifications (server/service role should insert)
CREATE POLICY "no_client_insert_notifications" ON public.communication_notifications
  FOR INSERT WITH CHECK (false);

CREATE POLICY "update_notifications_owner" ON public.communication_notifications
  FOR UPDATE USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

-- communication_conversation_participants
CREATE POLICY "select_participant_rows" ON public.communication_conversation_participants
  FOR SELECT USING (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY "insert_participant_owner_or_admin" ON public.communication_conversation_participants
  FOR INSERT WITH CHECK (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY "update_participant_owner_or_admin" ON public.communication_conversation_participants
  FOR UPDATE USING (profile_id = auth.uid() OR public.is_admin()) WITH CHECK (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY "delete_participant_owner_or_admin" ON public.communication_conversation_participants
  FOR DELETE USING (profile_id = auth.uid() OR public.is_admin());

-- communication_conversations
CREATE POLICY "select_conversation_if_participant_or_admin" ON public.communication_conversations
  FOR SELECT USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.communication_conversation_participants p WHERE p.conversation_id = public.communication_conversations.id AND p.profile_id = auth.uid() AND p.deleted = false
    )
  );

CREATE POLICY "insert_conversation_owner_or_admin" ON public.communication_conversations
  FOR INSERT WITH CHECK (created_by = auth.uid() OR public.is_admin());

CREATE POLICY "update_conversation_admin_or_creator" ON public.communication_conversations
  FOR UPDATE USING (created_by = auth.uid() OR public.is_admin()) WITH CHECK (created_by = auth.uid() OR public.is_admin());

-- communication_messages
CREATE POLICY "select_messages_if_participant" ON public.communication_messages
  FOR SELECT USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.communication_conversation_participants p WHERE p.conversation_id = public.communication_messages.conversation_id AND p.profile_id = auth.uid() AND p.deleted = false
    )
  );

CREATE POLICY "insert_message_participant_only" ON public.communication_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.communication_conversation_participants p WHERE p.conversation_id = public.communication_messages.conversation_id AND p.profile_id = auth.uid() AND p.deleted = false
    )
  );

CREATE POLICY "update_message_sender_only" ON public.communication_messages
  FOR UPDATE USING (sender_id = auth.uid() OR public.is_admin()) WITH CHECK (sender_id = auth.uid() OR public.is_admin());

-- communication_message_reads
CREATE POLICY "select_reads_owner_or_admin" ON public.communication_message_reads
  FOR SELECT USING (profile_id = auth.uid() OR public.is_admin());

CREATE POLICY "insert_reads_owner_only" ON public.communication_message_reads
  FOR INSERT WITH CHECK (profile_id = auth.uid());

-- communication_announcements
-- Announcements are readable by everyone; creation/modification is admin-only
CREATE POLICY "select_announcements_public" ON public.communication_announcements
  FOR SELECT USING (true);

CREATE POLICY "admin_insert_announcements" ON public.communication_announcements
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "admin_update_announcements" ON public.communication_announcements
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "admin_delete_announcements" ON public.communication_announcements
  FOR DELETE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- communication_support_tickets
CREATE POLICY "select_tickets_requester_assignee_or_admin" ON public.communication_support_tickets
  FOR SELECT USING (
    requester_id = auth.uid() OR assignee_id = auth.uid() OR public.is_admin()
  );

CREATE POLICY "insert_ticket_requester_only" ON public.communication_support_tickets
  FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY "update_tickets_assignee_or_admin_or_requester" ON public.communication_support_tickets
  FOR UPDATE USING (
    requester_id = auth.uid() OR assignee_id = auth.uid() OR public.is_admin()
  ) WITH CHECK (
    requester_id = auth.uid() OR assignee_id = auth.uid() OR public.is_admin()
  );

-- Testing guidance (use Supabase SQL editor to simulate jwt claims):
-- Example: simulate actions for a profile (replace <uuid> with a real profile id)
-- SELECT set_config('request.jwt.claims', '{"sub":"<uuid>"}', true);
-- Then run queries as that user to confirm policies.

-- To revert policies in staging, disable RLS or drop policies individually.
