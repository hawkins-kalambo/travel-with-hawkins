-- communication_center_rls_staging.sql (2026-07-24) used a completely
-- different, disjoint policy-naming scheme ("select_announcements_public"
-- etc.) from 2026_08_01_reconcile_communication_center.sql's own names
-- ("communication_announcements_admin" etc.). That reconcile migration's
-- DROP POLICY IF EXISTS statements only ever named its own policies, so on
-- any database where the staging file was actually applied at some point,
-- every one of its 22 policies is still live today — combined via OR with
-- the correctly-scoped policies the reconcile migration added, not
-- replaced by them.
--
-- Most consequential: "select_announcements_public" is `USING (true)` —
-- unconditional read access for anon/authenticated — which defeats the
-- reconcile migration's audience-scoped SELECT policy on
-- communication_announcements regardless of what that policy says, since
-- Postgres ORs all matching permissive policies together. Admin-only
-- announcements would still be readable by anyone.
--
-- Idempotent: every statement is IF EXISTS, so this is a safe no-op on any
-- database where the staging file was never applied in the first place.

DROP POLICY IF EXISTS "select_notifications_owner_or_admin" ON public.communication_notifications;
DROP POLICY IF EXISTS "no_client_insert_notifications" ON public.communication_notifications;
DROP POLICY IF EXISTS "update_notifications_owner" ON public.communication_notifications;
DROP POLICY IF EXISTS "select_participant_rows" ON public.communication_conversation_participants;
DROP POLICY IF EXISTS "insert_participant_owner_or_admin" ON public.communication_conversation_participants;
DROP POLICY IF EXISTS "update_participant_owner_or_admin" ON public.communication_conversation_participants;
DROP POLICY IF EXISTS "delete_participant_owner_or_admin" ON public.communication_conversation_participants;
DROP POLICY IF EXISTS "select_conversation_if_participant_or_admin" ON public.communication_conversations;
DROP POLICY IF EXISTS "insert_conversation_owner_or_admin" ON public.communication_conversations;
DROP POLICY IF EXISTS "update_conversation_admin_or_creator" ON public.communication_conversations;
DROP POLICY IF EXISTS "select_messages_if_participant" ON public.communication_messages;
DROP POLICY IF EXISTS "insert_message_participant_only" ON public.communication_messages;
DROP POLICY IF EXISTS "update_message_sender_only" ON public.communication_messages;
DROP POLICY IF EXISTS "select_reads_owner_or_admin" ON public.communication_message_reads;
DROP POLICY IF EXISTS "insert_reads_owner_only" ON public.communication_message_reads;
DROP POLICY IF EXISTS "select_announcements_public" ON public.communication_announcements;
DROP POLICY IF EXISTS "admin_insert_announcements" ON public.communication_announcements;
DROP POLICY IF EXISTS "admin_update_announcements" ON public.communication_announcements;
DROP POLICY IF EXISTS "admin_delete_announcements" ON public.communication_announcements;
DROP POLICY IF EXISTS "select_tickets_requester_assignee_or_admin" ON public.communication_support_tickets;
DROP POLICY IF EXISTS "insert_ticket_requester_only" ON public.communication_support_tickets;
DROP POLICY IF EXISTS "update_tickets_assignee_or_admin_or_requester" ON public.communication_support_tickets;

-- Verification (run after applying):
--   SELECT policyname FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('communication_notifications', 'communication_conversations',
--       'communication_conversation_participants', 'communication_messages',
--       'communication_message_reads', 'communication_announcements', 'communication_support_tickets')
--     AND policyname IN ('select_notifications_owner_or_admin', 'no_client_insert_notifications',
--       'update_notifications_owner', 'select_participant_rows', 'insert_participant_owner_or_admin',
--       'update_participant_owner_or_admin', 'delete_participant_owner_or_admin',
--       'select_conversation_if_participant_or_admin', 'insert_conversation_owner_or_admin',
--       'update_conversation_admin_or_creator', 'select_messages_if_participant',
--       'insert_message_participant_only', 'update_message_sender_only', 'select_reads_owner_or_admin',
--       'insert_reads_owner_only', 'select_announcements_public', 'admin_insert_announcements',
--       'admin_update_announcements', 'admin_delete_announcements',
--       'select_tickets_requester_assignee_or_admin', 'insert_ticket_requester_only',
--       'update_tickets_assignee_or_admin_or_requester');
--   -- should return zero rows.
