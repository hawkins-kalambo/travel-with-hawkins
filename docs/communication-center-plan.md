# Travel with Hawkins Communication Center Plan

## 1. System architecture
- Add a shared communication surface for admin and ambassador experiences under `/admin/communication` and `/ambassador/communication`.
- Use the existing Next.js App Router, Supabase auth, and Supabase Admin client patterns already used by ambassador and admin APIs.
- Keep the UI consistent with the current Travel with Hawkins design language: blue primary, orange accent, card-based layouts, responsive spacing, and accessible states.
- Implement the first production-safe release as a layered module:
  1. Data access via Supabase-backed API routes.
  2. UI workspace components consumed by admin and ambassador pages.
  3. Event hooks that create notifications from existing workflows such as ambassador approvals.

## 2. Database design
The communication stack is designed around four core primitives:
- Conversations and participants for direct messaging.
- Notifications for system-generated events.
- Announcements for broadcast communications with audience targeting.
- Support tickets and replies for ambassador help requests.

The SQL migration in [db/communication_center_migration.sql](../db/communication_center_migration.sql) contains:
- `CREATE TABLE` statements for each domain.
- Indexes for filtering, sorting, and joins.
- Triggers for `updated_at` maintenance.
- RLS policies that scope records to the signed-in user or admin roles.
- Storage bucket creation for communication attachments.

## 3. Development phases
### Phase 1 — Foundation
- Create the shared SQL migration and plan document.
- Add a guarded API layer that gracefully degrades when the communication tables are not yet present.
- Add admin and ambassador entry points.

### Phase 2 — Notifications
- Create notification records from core platform workflows such as application approval and referral activity.
- Expose the notification feed to the UI.

### Phase 3 — Inbox and directory
- Display conversation summaries, unread state, and team directory data from the authenticated profile context.
- Support navigation from the directory into conversations.

### Phase 4 — Announcements and support
- Add announcement and ticket listing surfaces.
- Prepare the schema for threaded replies and file attachments.

## 4. Integration plan
### Existing modules to connect
- Ambassador application approval: create notification + approval event.
- Referral booking flow: create ambassador/admin notifications.
- Commission payment updates: notify ambassadors.
- Profile updates and account lifecycle events: create timeline notifications.

### Integration points already present in the codebase
- [app/api/applications/review/route.ts](../app/api/applications/review/route.ts)
- [app/api/ambassadors/route.ts](../app/api/ambassadors/route.ts)
- [app/api/bookings/route.ts](../app/api/bookings/route.ts)
- [app/api/commissions/route.ts](../app/api/commissions/route.ts)

## 5. API design
- `GET /api/communications?scope=all` returns summary cards, notifications, announcements, tickets, and directory entries for the current user.
- `POST /api/communications` can create notification records and future threaded messages.
- Admin routes may surface full visibility while ambassadors only see their own notifications and conversations.

## 6. Security model
- Supabase Auth remains the source of truth for identity.
- RLS policies restrict access to:
  - the current user’s notifications,
  - conversations where the user is a participant,
  - announcements that match the user’s role and audience,
  - support tickets that the user owns or is assigned to.
- Admins and super admins can see broader communication data.

## 7. RLS strategy
- `communication_notifications`: users can access only their own rows unless admin/super_admin.
- `communication_conversations` and `communication_conversation_participants`: participants can access conversations they belong to.
- `communication_announcements`: role- and audience-based visibility.
- `communication_support_tickets`: requesters/assignees can access their ticket records; admins can view all.

## 8. Testing checklist
- Verify API routes return expected data for admin and ambassador roles.
- Verify that approval actions create notifications without breaking the existing application review flow.
- Verify empty, loading, and error states in the UI.
- Run lint and production build after each substantial change.

## 9. Rollback considerations
- Keep the new UI behind the new routes so existing pages remain unchanged.
- If the DB migration is not available yet, the API responds with a clear empty-state payload instead of throwing a hard failure.
- The communication tables can be added later without changing the UI contract.
