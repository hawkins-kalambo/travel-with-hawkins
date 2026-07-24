# Communication Center — Architecture & Implementation Blueprint

NOTE: SQL schema is provided first for review and approval. Do NOT run without reviewing RLS and production secrets.

-- SUPABASE SQL (Run in SQL editor)
-- Tables, indexes, foreign keys, triggers, and RLS for the Communication Center

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

-- 4) Read receipts (per-message per-profile)
CREATE TABLE IF NOT EXISTS public.communication_message_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.communication_messages(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, profile_id)
);

-- 5) Notifications (user-level automated notifications)
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

-- 6) Announcements (broadcasts)
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

-- 8) Utility triggers: update updated_at on conversations/participants/tickets
CREATE OR REPLACE FUNCTION public.update_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_conversation_timestamp BEFORE UPDATE ON public.communication_conversations FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
CREATE TRIGGER trg_update_participant_timestamp BEFORE UPDATE ON public.communication_conversation_participants FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();
CREATE TRIGGER trg_update_tickets_timestamp BEFORE UPDATE ON public.communication_support_tickets FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();

-- 9) Example function: generate notification when ticket assigned
CREATE OR REPLACE FUNCTION public.notify_ticket_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  notif RECORD;
BEGIN
  IF NEW.assignee_id IS NOT NULL AND (OLD.assignee_id IS NULL OR OLD.assignee_id <> NEW.assignee_id) THEN
    INSERT INTO public.communication_notifications(profile_id, type, title, message, priority, related_type, related_id)
    VALUES (NEW.assignee_id, 'support_ticket_assigned', 'Ticket assigned', CONCAT('You have been assigned ticket: ', NEW.subject), 'normal', 'support_tickets', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_ticket_assignment AFTER UPDATE ON public.communication_support_tickets FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_assignment();

-- 10) Row Level Security (examples)
-- Enable RLS on tables used by the client (only once you have policies tested)
-- Example: notifications — allow selecting own notifications
-- ALTER TABLE public.communication_notifications ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "notifications_select_own" ON public.communication_notifications
--   FOR SELECT USING (auth.uid() = profile_id);
-- CREATE POLICY "notifications_insert_server" ON public.communication_notifications
--   FOR INSERT WITH CHECK (true); -- inserts come from service-role on server-side only

-- NOTE: All client-facing tables MUST have RLS policies matching your authentication model.

-- End of SQL

---

**Overview**

This document defines the Communication Center as a platform service used by all modules: Applications, Bookings, Referrals, Ambassadors, CRM, Commissions, Reports, and Admin/Ambassador dashboards.

**Design goals**
- Centralized event-driven communication engine.
- Reusable notification primitives for push, email, in-app inbox, and audit timeline.
- Fine-grained permissions via Supabase RLS for client queries.
- Non-blocking: events should not block core flows.

**System Architecture (high-level)**
- Communication Center service (API + worker) — primary service that owns all communication tables and business logic.
- Event Bus: an internal event table (or message queue) where system modules publish events. A worker processes these events into notifications/messages/announcements/emails.
- API surface: REST/Edge (Next.js App Router) endpoints for Inbox, Notifications, Messages, Announcements, Tickets, Team Directory.
- Background worker: Node/Serverless process (Vercel cron, Supabase Functions, or separate worker) that delivers email via Resend, creates notifications, and writes messages.

Flow:
- App Module (e.g., Bookings) publishes event via `publishEvent({type, payload, actor, context})` to `communication_events` (or calls Communication Engine API).
- Communication Engine enqueues and processes event:
  - Create notifications in `communication_notifications` for affected profiles.
  - Optionally create a conversation in `communication_conversations` and seed `communication_messages`.
  - Trigger email via `lib/resend.ts` when configured.
  - Log activity to `activity_log` (if exists) or `communication_activity`.

**Database architecture (summary)**
- Use existing `profiles` table as the canonical user identity.
- Communication tables (see SQL above) hold conversations, participants, messages, notifications, announcements, tickets.
- All relational constraints reference `profiles(id)`.

**Folder / Code Structure** (recommended additions)
- app/communication/ (UI routes) — shared inbox UI used by Admin/Ambassador/Student variants.
- app/api/communication/ (API endpoints)
  - route.ts (summary)
  - messages/route.ts
  - notifications/route.ts
  - announcements/route.ts (existing)
  - tickets/route.ts (existing)
- lib/communicationEngine.ts — core functions: `publishEvent()`, `processEvent()`, `createConversation()`, `createNotification()` (wraps existing), `createMessage()`.
- lib/communicationWorker.ts — background worker / queue processor.
- lib/communicationTypes.ts — shared TypeScript types for events and payloads.

**API Design (examples)**
- GET /api/communication -> summary (existing `/api/communications`)
- GET /api/communication/notifications?limit=20&unread=true
- POST /api/communication/notifications (admin/service only)
- GET /api/communication/inbox -> conversation list
- GET /api/communication/conversations/:id/messages?limit=50
- POST /api/communication/conversations -> create group conversation
- POST /api/communication/conversations/:id/messages -> send message (participants only)
- GET /api/communication/announcements -> list
- POST /api/communication/announcements -> create (admin only)
- GET /api/communication/tickets -> list
- POST /api/communication/tickets -> open ticket
- PATCH /api/communication/tickets/:id -> update/assign

Each endpoint must validate auth using existing helpers (`requireAuthenticatedUser`, `requireAdminUser`) and utilize `supabaseAdmin` for server-side operations.

**Event System**
- Event types (canonical): application_submitted, application_approved, ambassador_created, booking_confirmed, booking_cancelled, referral_linked, commission_generated, commission_paid, password_changed, profile_updated, support_ticket_assigned, announcement_published.
- publishEvent({ type, actorProfileId, payload, targetProfiles?, related })
- Events are stored in `communication_events` (optional) or passed directly to the worker via HTTP message queue.
- Worker processes events idempotently — store processed_event_id to avoid duplication.

**Notification Flow (example)**
1) Application Approved (source: /api/applications/review)
  - Call `publishEvent({type:'application_approved', actor: adminId, payload:{applicationId, ambassadorId}})`
2) Worker receives event
  - Creates a `communication_notifications` entry for ambassador profile with type `application_approved`.
  - Creates a `communication_conversations` of type `system` titled "Welcome" if not exists; inserts a welcome `communication_messages` entry.
  - Sends welcome email via `lib/resend.ts` (non-blocking). Log result.
  - Optionally create a public announcement (admins only) or activity log.

**User Permissions & Roles**
- Roles: `super_admin`, `admin`, `ambassador`, `student` (future), `system`.
- Summary permissions:
  - Super Admin: full access to all modules and global announcements.
  - Admin: manage announcements, view all tickets, message ambassadors, access team directory.
  - Ambassador: access own notifications, read/write messages in conversations they participate in, create tickets to admins, receive announcements targeted to ambassadors or everyone.
  - Student: similar to ambassador but limited to student audience (future).

**Security / RLS Guidance**
- Enforce RLS on all client-accessible tables.
- Use `auth.uid()` in RLS policies to limit selects to owner records.
- Server-side operations (in API routes) should use `supabaseAdmin` with service-role key and bypass RLS.
- Carefully scope `INSERT` policies: allow client to create tickets (with `requester_id = auth.uid()`), but creation of notifications must be server-only.

**Development Phases (incremental)**
- Phase 0: Audit current usage (we've started this). Map existing calls to `createNotification` and existing announcement/ticket endpoints.
- Phase 1: Database — create tables, indexes, triggers, and minimal RLS in a staging DB. Provide migration SQL and runbook.
- Phase 2: Communication Engine — implement `lib/communicationEngine.ts` and simple worker to process a few core events (applications, commissions, bookings).
- Phase 3: Notifications API & Inbox UI — add robust notifications endpoint, inbox list, and conversation endpoints.
- Phase 4: Announcements — extend current announcements to use engine publish flow, add scheduling and expiry support.
- Phase 5: Support Tickets — enhance tickets to create associated conversation and notifications; add admin assignment flows.
- Phase 6: Team Directory — implement profiles/online status, integrate with conversations for quick message creation.
- Phase 7: Analytics — add `communication_metrics` views and dashboards for stats.

Each phase includes automated tests, linting, and a staged rollout.

**Testing Checklist (after each phase)**
- Run `npm run lint` and `npm run build` with zero warnings/errors for changed files.
- Authentication: verify `authFetch` and server routes still operate with session refresh.
- Routes: smoke-test all API endpoints for authorized and unauthorized users.
- Database: validate migrations executed and no destructive changes to existing tables.
- Permissions: validate RLS policies for client flows using staging user accounts.
- Regression: verify Bookings, Applications, Referrals, Ambassadors, CRM features still work.
- Worker: test idempotency by sending duplicate events.
- Email: verify Resend API calls only from server with proper template and logging.

**Operational Concerns**
- Monitoring: instrument events and worker with logs and metrics (Sentry, Datadog, or simple structured logs).
- Backfills: add migration scripts to backfill legacy events as notifications if required.
- Storage: store attachments in Supabase Storage with ACLs; store references in `communication_messages.attachments`.

**Dev Notes & Next Steps**
- I will produce a migration SQL file and a minimal `lib/communicationEngine.ts` wrapper next for review.
- Confirm whether we should use Supabase Functions / Edge Runners or a hosted worker (Vercel serverless) for the background processor.

---

Document maintained by: Lead Architect

Keep this file in-sync during implementation and mark each completed phase here.
