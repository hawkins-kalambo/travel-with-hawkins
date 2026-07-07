# Travel with Hawkins — Phase 2 Audit Report (Initial)

## Scope
Next.js 15+/16 App Router + Supabase + Resend + Tailwind.

## Phase 0 — Backup
- ✅ Created backup branch: `backup/phase1-audit-20260630`

## Phase 2 — Findings Summary (based on repo reads + lint)

### A) Authentication / Admin Access (Critical)
**Files:**
- `app/login/page.tsx`
- `app/admin/page.tsx`

**Issues:**
1. Hardcoded admin credentials:
   - `username === "admin"`
   - `password === "1234"`
2. Admin session stored in `localStorage` only.
3. Admin page is client-gated with `localStorage.getItem("auth")`.
4. Admin page contains localStorage persistence for settings, including:
   - `secretPassword: "1234"`

**Impact:**
- Anyone can access `/admin` by manipulating `localStorage`.

### B) API Security / Supabase Service Role (Critical)
**Files:**
- `app/api/bookings/routes.ts`

**Issues:**
1. Supabase service role used directly in API route handlers:
   - `process.env.SUPABASE_SERVICE_ROLE_KEY!`
2. CRUD + status updates available without any auth/session validation.
3. Error handling leaks internal error messages:
   - `error: message` where `message` comes from `error.message`.

**Impact:**
- Anonymous users can create/read/update/delete bookings and manipulate statuses.

### C) Email System (Partial / Needs Full Verification)
**Files read:**
- `lib/resend.ts`
- `app/api/bookings/routes.ts`
- `app/api/send-booking-email/route.ts`
- `emails/BookingConfirmation.tsx`
- `emails/AdminNotification.tsx`

**Verified:**
- There are multiple email-related endpoints/templates.

**Not yet verified:**
- Requirement: **Booking must send TWO emails** (Passenger confirmation + Admin notification) with correct templates and environment handling.

### D) Realtime vs Polling (High)
**Files:**
- `lib/useBookingsRealtime.ts`
- `app/admin/page.tsx`

**Verified:**
- `lib/useBookingsRealtime.ts` exists and subscribes to `bookings` realtime changes.
- Admin dashboard currently uses polling:
  - `setInterval(..., 15000)`
- Manual “Refresh” button exists.

**Impact:**
- Dashboard is not meeting realtime requirement.

### E) TypeScript / ESLint / React Compiler Issues (High)
**`npm run lint` errors found:**
1. `app/page.tsx`
   - `Unexpected any` (2 instances)
   - `react/no-unescaped-entities` for `'`.
   - `react-hooks/preserve-manual-memoization` / compilation skipped.
   - Warnings: unused `API_URL` and missing dependency in `useEffect`.
2. `emails/BookingConfirmation.tsx`
   - `react-hooks/set-state-in-effect` (setState directly in effect body)

### F) Legacy System Presence (Confirmed)
**File:**
- `Code.gs`

**Verified:**
- Contains Google Apps Script logic including:
  - Gateway token checks.
  - Sheet read/write operations.

**Impact:**
- Legacy backend still exists and must be fully removed in Phase 3.

## Lint / Build Status (current)
- ✅ `next build` previously compiled successfully, but:
- ❌ `npm run lint` currently fails with the 7 errors listed above.

## Next Steps (Phase 2 completion)
1. Continue audit by reading all remaining API routes, auth helpers, Supabase helpers, and email templates.
2. Validate Supabase table schemas vs code expectations.
3. Produce full audit report (scores + issue list) after remaining reads.


