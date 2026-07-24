# Communication Center — Staging Runbook

Purpose: provide step-by-step instructions to deploy and validate the Communication Center migration in a staging Supabase environment.

Prerequisites
- Access to the staging Supabase project and its SQL editor, or a CI user with `SUPABASE_SERVICE_ROLE_KEY` that can run migrations.
- Backups configured (database dump or point-in-time recovery).
- Environment variables for staging set (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY if testing email sending).

Files
- Migration SQL: [db/migrations/communication_center_2026_07_24.sql](db/migrations/communication_center_2026_07_24.sql)

High-level steps
1) Backup staging database
2) Apply migration in a transaction
3) Smoke tests (server-side)
4) Add RLS policies (carefully)
5) Client verification (web UI)
6) Run integration tests and verify no regressions

Detailed steps

1) Backup staging database
- In Supabase UI: Project -> Backups -> Create manual backup.
- Or via psql (replace placeholders):
```powershell
PGPASSWORD="${env:STAGING_DB_PASSWORD}" pg_dump -h ${env:STAGING_DB_HOST} -U ${env:STAGING_DB_USER} -Fc -f communication_center_backup_$(Get-Date -Format yyyyMMddHHmm).dump ${env:STAGING_DB_NAME}
```

2) Apply migration
- Option A — Supabase SQL editor (recommended for quick staging test):
  - Open the SQL editor and paste the contents of [db/migrations/communication_center_2026_07_24.sql](db/migrations/communication_center_2026_07_24.sql).
  - Run the script and ensure it completes successfully.

- Option B — CI/deployment runner (recommended for reproducible deploy):
  - Commit the migration file to your migrations directory and run via your runner that connects to the staging DB and runs the SQL in a transaction.

3) Smoke tests (server-side)
- From the repository, run linter/build to ensure code referencing new tables compiles:
```powershell
npm run lint
npm run build
```
- Test server-side creation paths that use `supabaseAdmin` (service role). Example (Node REPL or tiny script):
  - Create a notification via `supabaseAdmin.from('communication_notifications').insert({...})` and confirm it is stored.
  - Create an announcement via the `/api/announcements` endpoint.

4) Adding RLS policies (staging first)
- IMPORTANT: RLS must be validated in staging thoroughly before enabling in production.
- Suggested minimal policies (Examples):

-- Notifications: allow users to SELECT their own notifications
-- ALTER TABLE public.communication_notifications ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "select_own_notifications" ON public.communication_notifications
--   FOR SELECT USING (auth.uid() = profile_id);
-- CREATE POLICY "insert_from_server" ON public.communication_notifications
--   FOR INSERT WITH CHECK (true); -- only server-side with service role will insert notifications

-- Conversations: clients may select conversations where they are a participant
-- ALTER TABLE public.communication_conversations ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "select_participant_conversations" ON public.communication_conversations
--   FOR SELECT USING (EXISTS (SELECT 1 FROM public.communication_conversation_participants p WHERE p.conversation_id = id AND p.profile_id = auth.uid() AND p.deleted = false));

-- Participants: allow insert only by server or when profile_id == auth.uid()
-- ALTER TABLE public.communication_conversation_participants ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "participants_insert_owner" ON public.communication_conversation_participants
--   FOR INSERT WITH CHECK (profile_id = auth.uid());

Apply these policies in the Supabase SQL editor and test using a staging user.

5) Client verification
- Log in as an ambassador and admin in the staging site.
- Verify:
  - /api/communications returns expected summary.
  - Creating an announcement from Admin generates a row in `communication_announcements`.
  - Creating a ticket as Ambassador writes to `communication_support_tickets` and triggers assignment notifications when updated.
  - Notifications appear in the ambassador inbox UI.

6) Integration tests & regression checks
- Run existing automated tests if present.
- Manually exercise: Bookings, Applications, Commissions, Referrals flows that previously called `createNotification` and confirm notifications are recorded.

Rollback procedure
- If migration causes a problem, restore from the backup created in step 1.
- Alternatively, drop the new tables (see ROLLBACK section inside migration file) and revert code changes.

Post-deployment checklist
- After RLS validated, update the production migration path and schedule a maintenance window.
- Add monitoring for worker errors and notification failures (Sentry or structured logs).

Notes
- Avoid enabling RLS in production until all client flows have been tested in staging; enabling RLS too early will break client API calls that assume server inserts.
- Configure Supabase Storage for attachments and update `communication_messages.attachments` with storage references.
