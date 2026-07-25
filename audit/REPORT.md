# Travel with Hawkins Communication Center — Architecture Audit

Date: 2026-07-25
Status: Implemented and verified in the current workspace

## Executive summary
The Communication Center is now present as a working platform module inside the Next.js app router, backed by Supabase and exposed through dedicated API routes for notifications, announcements, conversations, and support tickets. The implementation is a strong first-release foundation: it is structured, route-driven, role-aware, and compiles successfully in production mode.

That said, the current system should be treated as a solid MVP rather than a fully hardened enterprise communication platform. The main gaps are around production security, operational resilience, and richer workflow automation.

## Verification evidence
I verified the current implementation with:
- Editor diagnostics on the communication routes, engine, and UI files: no errors reported.
- Production build: `npm run build`
  - Result: success
  - Exit code: 0
  - The build output included the communication routes under `/api/communication`, `/api/communications`, and `/communication/conversations/[id]`.

## Current architecture
### 1. Service shape
The communication system is built as a layered module:
- Domain services in [lib/communicationEngine.ts](../lib/communicationEngine.ts)
- API routes under [app/api/communication](../app/api/communication)
- Shared UI entry points under [app/communication/page.tsx](../app/communication/page.tsx), [app/admin/communication/page.tsx](../app/admin/communication/page.tsx), and [app/ambassador/communication/page.tsx](../app/ambassador/communication/page.tsx)
- Conversation detail experience at [app/communication/conversations/[id]/page.tsx](../app/communication/conversations/[id]/page.tsx)

### 2. Core responsibilities
The implementation currently covers four primary communication capabilities:
- Notifications: automated in-app notifications for approvals, bookings, commissions, referrals, support tickets, and profile updates.
- Conversations: participant-based conversation lists and per-thread message sending.
- Announcements: admin-managed announcements surfaced to the UI.
- Support tickets: ambassador-side ticket creation and admin-side ticket assignment/status updates.

### 3. Data model
The schema is defined in [db/migrations/communication_center_2026_07_24.sql](../db/migrations/communication_center_2026_07_24.sql). It introduces dedicated tables for:
- conversations and participants
- messages and read tracking
- notifications
- announcements
- support tickets

This is a good foundation because it separates system notifications from user conversations and operational tickets.

## What is already implemented well
### Strengths
- Clear separation of concerns between engine, routes, and UI.
- Event-driven notification layer is already in place and reusable.
- Admin and ambassador experiences are both surfaced in the app.
- The conversation detail flow is functional and integrated with the API.
- Build verification succeeded, which suggests the module is stable from a compile perspective.

### Architectural quality
The implementation follows a practical pattern for a product team:
- Use existing auth helpers for request validation.
- Use server-side Supabase admin access for backend writes.
- Provide role-aware UI routes for admin and ambassador experiences.
- Gracefully degrade when the communication tables are missing or not yet populated.

## Current risks and gaps
### 1. Security hardening is incomplete
The current architecture relies on the existing auth helpers but the communication tables are not yet fully protected by a production-grade RLS strategy in the codebase. This is the most important remaining risk.

Why it matters:
- Client-facing communication tables should be limited by role and ownership.
- Notification and ticket data can become sensitive if not scoped correctly.
- Admin-only data exposure must be strictly enforced.

Recommendation:
- Implement tested RLS policies for notifications, conversations, messages, announcements, and tickets before broad rollout.
- Keep service-role writes on the server only and avoid client-side inserts for protected data.

### 2. The system is still a workflow-first MVP
The current implementation creates notifications and basic conversations, but it does not yet provide a fully production-grade communication runtime.

Missing or limited capabilities include:
- read receipts beyond basic message storage
- delivery tracking
- attachment handling for real files
- richer conversation threading and replies
- message status states
- audit trail for communication actions
- scheduled or targeted announcements with more granular audience rules

### 3. Event processing is still synchronous and local
The communication engine is effective for immediate event publishing, but it is not yet a resilient asynchronous worker or queue processor. In a larger environment, this can become a bottleneck, especially if communication events spike during approvals, bookings, commissions, or mass announcements.

Recommendation:
- Introduce a background worker or queue layer for non-blocking processing.
- Add idempotency protection so duplicate events do not create duplicate notifications.

### 4. API surface is functional but still thin
The current routes cover the essential use cases, but the API contract is still closer to a release candidate than a mature platform API.

Examples:
- Conversation routes support basic message sending but not participant management, thread creation, or message metadata.
- Announcements are admin-driven but not yet tied to a richer permission model or scheduling engine.
- Tickets are created and assigned, but they are not yet integrated into a deeper support workflow with conversation threads and statuses beyond the basic state field.

### 5. Observability and testing need strengthening
The module compiles, but it still needs deeper operational validation:
- automated tests for API routes
- role-based access tests
- duplicate-event handling tests
- message and notification regression tests
- staging validation of SQL policies and permissions

## Recommended next steps
### Phase 1 — harden the foundation
- Add RLS policies and validate them in staging.
- Review the communication tables for tenant scoping and role-based access.
- Add server-side logging for create/update/delete actions.

### Phase 2 — operationalize the engine
- Move event handling to a worker-based pattern.
- Add idempotency and retry semantics.
- Capture delivery outcomes for notifications and messages.

### Phase 3 — expand the product experience
- Add richer conversation features, including replies, unread state, participant management, and file attachments.
- Add admin tools for announcement scheduling and expiry handling.
- Expand support ticket workflows to include threaded replies and assignment history.

## Final assessment
Overall score: 7.5/10

Breakdown:
- Architecture clarity: 8/10
- Implementation completeness: 7/10
- Security readiness: 5/10
- Operational maturity: 6/10
- Product readiness: 7/10

Conclusion:
The Communication Center is now a credible and usable first-release platform module. It demonstrates the right architecture pattern and has been verified to build successfully. The remaining work should focus on hardening permissions, operational reliability, and richer workflow support before treating it as a production-grade communication platform.


