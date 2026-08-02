# Student Brand Ambassador System — Audit Report

**Site:** https://www.travelwithhawkins.com/
**Audit date:** 2026-08-01
**Branch audited:** `main` @ `223a6ea` (working tree clean except untracked `.claude/`)
**Auditor:** Claude Code, read-only static + limited live-site inspection
**Status of this document:** Findings only. **No application code, database schema, or production data was modified as part of this audit.**

---

## 1. Executive Summary

The ambassador system is **further along than the repo's own internal notes suggest** — a stale document in the repo root (`AMBASSADOR_SYSTEM_ANALYSIS.md`, dated 2026-07-23) claims the application portal doesn't exist yet; it does, and it fully works end-to-end including automatic account provisioning on approval. That said, this audit found **one feature-breaking defect at the center of the whole referral loop**, several **financial-integrity gaps**, and a **cluster of database-migration defects** that need to be checked directly against the live schema before this system can be trusted for a real campaign.

**The single most important finding:** the `?ref=CODE` referral links that the system generates, emails to ambassadors, and displays on the ambassador dashboard **are never read by the booking page**. This was verified twice — once by reading `app/book/page.tsx`/`app/page.tsx` (no code anywhere parses a `ref` query parameter), and once by loading `https://www.travelwithhawkins.com/book?ref=TESTCODE123` on the live production site, which shows no trace of the code anywhere in the UI. Today, referral attribution only works if a customer *manually types* the ambassador's code into a "Referral Code (optional)" field inside the booking modal. The link-sharing mechanism the whole ambassador program is built around is non-functional.

Beyond that, the system has a genuinely well-built payment core: PayChangu webhook signature verification, idempotent payment finalization via a row-locking Postgres RPC, and server-side fare/price resolution are all correctly implemented and could not be manipulated from the client. Role-based access control for the ambassador dashboard is also sound — every data-fetching endpoint an ambassador can call resolves their identity from the authenticated session, never from client-supplied IDs, and no IDOR was found.

Where the system is weak is at the edges: the public application form has almost no server-side validation (phone format, duplicates, rate limiting), commissions are never reversed when a booking is cancelled or refunded, nothing stops an ambassador from referring themselves, and the SQL migration history contains files with invalid Postgres syntax and duplicate/conflicting table definitions whose real effect on the production schema cannot be determined without direct database access (which this audit did not use, per the read-only constraint).

**Bottom line: Not ready until critical issues are fixed** — primarily the broken referral link (nothing about a "referral program" works for a customer who just clicks a link) and the commission-integrity gaps. See §17 for the full readiness assessment.

---

## 2. Audit Scope

Per the engagement brief, this audit covers the ambassador system end-to-end: application → admin review → approval → ambassador account → referral code/link → booking → attribution → payment → commission → ambassador dashboard → admin referral/commission management. It was explicitly scoped as **read-only**: no destructive database commands, no production data changes, no real PayChangu charges, no real emails/SMS/WhatsApp sends.

**What this audit did:**
- Full static review of the relevant Next.js App Router code, API routes, middleware, and library modules (partly via five parallel focused code-reading passes, each producing file:line-cited findings that were then spot-verified first-hand against the source files listed below).
- Full read of every SQL migration file touching ambassadors, referrals, commissions, applications, payments, and communication.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` executed locally against the repository.
- Two read-only `GET` requests against the live production site (`/ambassador/apply`, `/book?ref=TESTCODE123`) to visually confirm code-level findings without submitting any data.

**What this audit did not do, and why:**
- **No live database queries.** No SQL was run against Supabase, and no live table contents (e.g., actual `commission_rules` rows, actual RLS policies as they exist in production, whether `ambassadors.user_id` really exists) were inspected. This audit had shell/file access only, not a database credential-authenticated session, and the brief prohibits destructive DB commands — out of caution, no live read queries were attempted either, since doing so safely would have required constructing and running ad hoc SQL against the production project.
- **No live form submissions.** The only Supabase project configured in `.env.local` is a single project (`NEXT_PUBLIC_SUPABASE_URL`); no separate staging/test project or database branch was found anywhere in the repo or its configuration. Since the brief explicitly forbids modifying production data, and there is no isolated test environment to submit against, this audit did **not** start a local dev server and submit ambassador applications, bookings, or payments — doing so against the only configured database would have written real rows to production. This is the single biggest testing limitation in this report; see §4 for what specifically remains unverified as a result and what's needed to unblock it.
- **No PayChangu test-mode transaction was triggered.** No sandbox/test PayChangu credentials were confirmed available (only variable *names* were checked in `.env.local`/`.env.example`, never values, per the instruction not to expose secrets), and even test-mode payments would need a real booking to attach to.

Given these constraints, essentially all findings in this report are labeled **Verified** (confirmed by direct code reading, and in a few cases by a matching live-site observation), **Inferred from code** (a reasonable conclusion from the code that wasn't independently exercised), or **Blocked from testing** (requires DB/live-payment access this session didn't have). No claim in this report says a feature "works" without a code citation backing it.

---

## 3. Architecture Overview

| Layer | Technology | Evidence |
|---|---|---|
| Framework | Next.js 16.2.9, App Router, Turbopack | `package.json:21`, confirmed by `next build` output |
| UI | React 19.2.4, Tailwind CSS 4 | `package.json:22-23,27,34` |
| Language | TypeScript 5, `strict: true` | `tsconfig.json` |
| Database/Auth | Supabase Postgres + Supabase Auth (`@supabase/supabase-js` 2.108.2, `@supabase/ssr` 0.12.0) | `package.json:15-16` |
| Payments | PayChangu (Standard Checkout), custom integration in `lib/payments/*` | `.env.example` |
| Email | Resend API | `lib/resend.ts`, `package.json:24` |
| SMS | Africa's Talking | `lib/africasTalking.ts`, `package.json:17` |
| Rate limiting | Custom in-memory limiter, no external store | `lib/rateLimit.ts` |

**Auth/role model (verified, `lib/supabaseServer.ts`, `lib/permissions.ts`, `lib/adminAuth.ts`):** every request's role is re-derived server-side from the verified Supabase session (`user.id`/`user.email`), never trusted from client input. Role resolution checks, in order: a dedicated `admins` table (not present in any tracked migration — created outside migration history, same pattern as `bookings`/`settings`), then the `ambassadors` table (matched by `user_id`/`profile_id`/email), then falls back to `profiles.role` or `user_metadata.role`. `requireAdminUser()` and `requireAuthenticatedUser()` are the two gating functions used throughout the API layer; `middleware.ts` additionally enforces role for **UI routes** (`/admin/*`, `/ambassador/*`, `/customer/*`) but, for **API routes**, only enforces authentication — role/permission checks for admin API routes are left entirely to each route handler. Every admin/ambassador-sensitive API route reviewed in this audit does independently re-check (§10), so this is not currently exploitable, but it means middleware is not a safety net for a future route that forgets the check.

**Route inventory (ambassador-relevant):**

| Area | Path |
|---|---|
| Public application | `app/ambassador/apply/page.tsx` |
| Ambassador login/dashboard | `app/ambassador/login`, `app/ambassador/(protected)/dashboard`, `.../commissions`, `.../customers`, `.../profile`, `.../application-status` |
| Admin applications | `app/admin/applications/page.tsx` |
| Admin ambassadors | `app/admin/ambassadors/page.tsx`, `app/admin/ambassadors/[id]/page.tsx`, `app/admin/components/AmbassadorCreationWizard.tsx` |
| Admin referrals/commissions | `app/admin/referral-bookings/page.tsx`, `app/admin/commission-rates/page.tsx`, `app/admin/business-configuration/referral-program/page.tsx` |
| Application API | `app/api/applications/route.ts` (submit/list), `app/api/applications/review/route.ts` (approve/reject) |
| Ambassador API | `app/api/ambassadors/route.ts`, `app/api/ambassadors/[id]/route.ts`, `app/api/ambassadors/password/route.ts`, `app/api/ambassadors/resend/route.ts` |
| Referral API | `app/api/referrals/route.ts`, `app/api/referrals/validate/route.ts` |
| Commission API | `app/api/commissions/route.ts`, `app/api/commission-rules/route.ts` |
| Booking | `app/api/bookings/route.ts`, `app/book/page.tsx` → renders `app/page.tsx` |
| Payments | `lib/payments/*`, `app/api/payments/*` |

---

## 4. Ambassador Lifecycle Map

```
Student fills /ambassador/apply (4-step form, no auth required)
        │  POST /api/applications  — presence-only server validation, NO rate limit, NO duplicate check
        ▼
ambassador_applications row created (status='pending')
        │  admin views /admin/applications  (requireAdminUser — server-verified)
        ▼
Admin clicks Approve/Reject  →  POST /api/applications/review
        │
        ├─ Reject: status='rejected', optional email. Reason NOT required. No guard against
        │           re-processing an already-decided application (race condition possible).
        │
        └─ Approve (fully automatic, one request):
              1. Look up existing auth user by email
              2. Generate referral code = SLUG(full_name) + "01" (not the "TH-MZU-00001" format
                 assumed in the brief — that format does not exist anywhere in the codebase)
              3. supabaseAdmin.auth.admin.createUser() with a random temp password
              4. Insert profiles row (role='ambassador')
              5. Insert/reuse ambassadors row (status='active', referral_code=...)
              6. Update application status='approved'
              7. Email the ambassador: referral code + link (+ temp password if new account)
        ▼
Ambassador logs in (Supabase Auth) → /ambassador/dashboard
   Referral link shown: {origin}/book?ref={CODE}   ← THIS PARAMETER IS NEVER READ (§8, AMB-001)
        │
        ▼
Customer must MANUALLY TYPE the code into the booking modal's "Referral Code (optional)" field
        │  POST /api/bookings — server independently re-validates the code against `ambassadors`
        │  (status must be 'active'), resolves ambassador_id itself (client cannot forge it),
        │  computes commission from `commission_rules` at THIS moment, and inserts:
        │    - bookings row (referral_code, ambassador_id, commission_amount, referral_status='pending')
        │    - referrals row (commission_status='pending')   ← created before ANY payment happens
        ▼
Customer optionally pays booking fee / fare via PayChangu (or "pay later"/cash — commission
already exists regardless of this choice)
        │  webhook (HMAC-verified) → finalize_payment() RPC → updates booking_fee_status/fare_status
        │  (this RPC never touches `referrals` or `commission_amount` — payment and commission
        │  are two fully decoupled systems)
        ▼
Admin manually reviews /admin/referral-bookings or similar and PATCHes /api/commissions
to move commission_status: pending → approved → paid   (100% manual, no automation, no
gating on whether the booking was actually paid, and NO reversal if the booking is later
cancelled/refunded — §9, AMB-002)
        ▼
Ambassador dashboard totals = client-side sum over the same `referrals` rows the API
already scoped to that ambassador's session-derived ID (no separate cache to drift)
```

---

## 5. Database Relationship Summary

**Note on data provenance:** this section is built entirely from the 14 SQL files found in the repository (listed below) via static reading — **no live schema introspection was performed**. Several of these files show clear evidence of never having been fully/consistently applied (see AMB-004/AMB-005), and `bookings`, `settings`, and `admins` are used extensively by the application but are **never `CREATE TABLE`'d in any tracked migration** — they exist in production only, created outside the migration history that ships with this repo. Treat the diagram below as "what the code assumes exists," not confirmed production truth.

```
auth.users ──1:1── profiles (role: admin|ambassador|customer)
                        │
                        ├──1:1(ish)── ambassadors (referral_code UNIQUE, status, profile_id FK)
                        │                   │
                        │                   ├──1:N── referrals (booking_id UNIQUE, commission_amount,
                        │                   │          commission_status, ambassador_id FK→ambassadors)
                        │                   ├──1:N── ambassador_activity_logs   [RLS never enabled]
                        │                   ├──1:N── commission_transactions   [dead table, per migration author's own note]
                        │                   ├──1:N── manifests                 [no ambassador self-view RLS]
                        │                   ├──1:N── wallet_transactions       [schema exists, NEVER written by any app code]
                        │                   └──1:N── payout_requests          [schema exists, NEVER written by any app code]
                        │
                        └── (separately) admins table — NOT in any tracked migration; primary
                              source of truth for admin role resolution in lib/supabaseServer.ts

ambassador_applications (status: pending|approved|rejected) — defined TWICE, incompatibly
    (db/ambassador_applications_migration.sql vs referral_system_migration.sql) — see AMB-005

bookings (not in tracked DDL) ── referral_code, ambassador_id (NO FK constraint), commission_amount
    ├──1:1(by text match, not FK)── referrals.booking_id
    └──1:N (by text match, not FK)── payments.booking_id
                                          │
                                          ├── payment_events (idempotency_key UNIQUE)
                                          └── finalize_payment() RPC — SECURITY INVOKER, row-locks
                                              payments + bookings, only callable by service_role
```

Key integrity facts (all independently confirmed by reading the source SQL):
- `ambassadors.referral_code` — `UNIQUE NOT NULL` (`referral_system_migration.sql:28`). Real, DB-enforced.
- `referrals.booking_id` — `UNIQUE` (`referral_system_migration.sql:53`). One commission per booking, enforced at the DB layer.
- `payments.internal_reference` — `UNIQUE`; `payments.provider_reference` — partial `UNIQUE` where not null (`db/migrations/2026_08_01_payments_wallet_audit_foundation.sql:107,115`).
- **No email uniqueness anywhere** — `profiles.email`, `ambassadors.email`, `customer_profiles.email` are all plain nullable `TEXT` with no unique constraint or index.
- **`bookings.ambassador_id` has no foreign key at all** (`referral_system_migration.sql:88`) — nothing at the DB layer stops it pointing at a non-existent ambassador (application code always resolves it server-side first, so this isn't currently exploited, but it's a latent integrity gap).

---

## 6. Inventory of Relevant Files

**Pages:** `app/ambassador/apply/page.tsx`, `app/ambassador/(protected)/{dashboard,commissions,customers,profile,application-status}/page.tsx`, `app/admin/{applications,ambassadors,ambassadors/[id],referral-bookings,commission-rates}/page.tsx`, `app/admin/business-configuration/referral-program/page.tsx`, `app/admin/components/{AmbassadorCreationWizard,AmbassadorCreationSuccess}.tsx`, `app/book/page.tsx`, `app/page.tsx`, `app/components/home/BookingModal.tsx`.

**APIs:** `app/api/applications/{route,review/route}.ts`, `app/api/ambassadors/{route,[id]/route,password/route,resend/route}.ts`, `app/api/referrals/{route,validate/route}.ts`, `app/api/commissions/route.ts`, `app/api/commission-rules/route.ts`, `app/api/bookings/route.ts`, `app/api/payments/{booking-fee/initialize,confirm,fare/initialize,fare/select-cash,fare/confirm-cash,status,webhook,send-receipt}/route.ts`.

**Libraries:** `lib/supabaseServer.ts`, `lib/adminAuth.ts`, `lib/permissions.ts`, `lib/supabaseAdmin.ts`, `lib/auth.ts`, `lib/bookingValidation.ts`, `lib/bookingUtils.ts`, `lib/routePricing.ts`, `lib/rateLimit.ts`, `lib/ambassadorActivity.ts`, `lib/ambassadorEmail.ts`, `lib/payments/{env,finalize-flow,initialize-handler,paychangu-client,paychangu-types,payment-service,reference,verification-validator}.ts`.

**Database:** `referral_system_migration.sql`, `db/ambassador_applications_migration.sql`, `db/migrations/2026_08_01_{finalize_payment_rpc,payment_finalization_safety,payments_wallet_audit_foundation,settings_route_objects_column}.sql`, `db/migrations/{add_role_constraints_to_profiles,customer_authentication_system,communication_center_2026_07_24,communication_center_rls_staging}.sql`, `db/communication_center_migration.sql`, `db/{backfill_fares_from_settings,check_fare_column,ensure_fare_column}.sql`.

**Automated tests found:** `lib/phoneNumbers.test.mjs`, `lib/payments/reference.test.ts`, `lib/payments/verification-validator.test.ts` — all payment/reference-generation focused. **No tests exist for any ambassador, referral, application, or commission logic.**

**Pre-existing internal docs found in repo (not used as source of truth — independently re-verified against current code):** `AMBASSADOR_SYSTEM_ANALYSIS.md` (stale — dated 2026-07-23, predates the now-working application portal), `audit/REPORT.md`, `DEBUG_COMMISSION_STATUS_REPORT.md`, `UX_UI_ARCHITECTURE_REVIEW_REPORT.md`, and several other markdown files at repo root. These were noted but not treated as ground truth; every claim in this report traces to code read during this session.

---

## 7. Functional Test Matrix

Legend: **V** = Verified (code and/or live-site evidence), **I** = Inferred from code (plausible but not independently exercised), **B** = Blocked from testing (needs DB/live-payment access not available this session), **F** = Failed.

| # | Scenario | Result | Evidence |
|---|---|---|---|
| 1 | Application form loads, 4-step layout | **V** | Live fetch of `/ambassador/apply` confirmed form renders with Step 1/4 fields; `app/ambassador/apply/page.tsx` |
| 2 | Required fields marked, client validation | **V** | `app/ambassador/apply/page.tsx:79-117` (`getError()`) |
| 3 | Email format validated | **V (client) / F (server)** | Client regex `app/ambassador/apply/page.tsx:48,90`; server only checks non-empty (`app/api/applications/route.ts:16,29`) |
| 4 | Phone validated for Malawi format | **F** | No format check anywhere, client or server — presence-only both places |
| 5 | Duplicate applications handled | **F** | No unique constraint on `email`/`student_id` in `db/ambassador_applications_migration.sql`; no server-side duplicate query in `app/api/applications/route.ts` |
| 6 | Server rejects invalid submissions independent of browser | **Partial (F for most rules)** | Only presence-checks are server-side; length/format/terms-checkbox are client-only |
| 7 | Submit button prevents duplicate submit | **Partial (F for real protection)** | Client `loading` disable only; no server idempotency key |
| 8 | Loading/success/error states | **V** | `app/ambassador/apply/page.tsx:227-308` |
| 9 | Applicant gets confirmation | **V (in-page) / F (no email)** | In-page "Application submitted" panel shown; no confirmation email sent on submission (only on approve/reject) |
| 10 | Application saved correctly | **V** | `app/api/applications/route.ts:105`, insert via service-role client |
| 11 | Admin sees new applications | **V** | `app/admin/applications/page.tsx` + `GET /api/applications` admin branch (`route.ts:124-127`) |
| 12 | Sensitive info protected from public API | **V (at API layer) / B (at RLS layer)** | `GET` requires authenticated session; RLS on `ambassador_applications` differs by which of two migrations is live (unverifiable without DB access — AMB-005) |
| 13 | Rate limiting on application submission | **F** | Confirmed absent — `app/api/applications/route.ts` does not call `isRateLimited` |
| 14 | Application closing-date config | **F (not implemented)** | No deadline/window column or check anywhere |
| 15 | Admin approve creates ambassador account automatically | **V** | `app/api/applications/review/route.ts:193-434` |
| 16 | Admin reject records reason | **Partial** | Field exists but optional, collected via `window.prompt()` |
| 17 | Same application can't be double-processed | **F** | No status guard before approve/reject logic runs |
| 18 | Referral code unique per ambassador | **V** | DB `UNIQUE` constraint + app pre-check (`app/api/ambassadors/route.ts:157-163`) |
| 19 | Referral link format | **V** | `{origin}/book?ref={CODE}` generated in 5 places (e.g. `app/api/ambassadors/route.ts:313`) |
| 20 | Referral link auto-attributes on click | **F (critical)** | Verified in code (`?ref=` never read in `app/book/page.tsx`/`app/page.tsx`) AND live on production (`/book?ref=TESTCODE123` shows no trace of the code) |
| 21 | Referral attribution survives page refresh/navigation | **F** | No cookie/localStorage/sessionStorage persistence exists at all — code lives only in React form state |
| 22 | Manually-typed referral code validated server-side | **V** | `app/api/bookings/route.ts:353-371` — independent DB lookup, ignores any client-trusted validation state |
| 23 | Client cannot forge `ambassador_id` directly | **V** | `lib/bookingValidation.ts` whitelist has no such field; server resolves it itself |
| 24 | Invalid/suspended/deleted referral code handling | **V** | Booking rejected with 400 "Invalid referral code" unless `ambassadors.status = 'active'` |
| 25 | Self-referral prevented | **F** | No check compares ambassador identity to booker identity anywhere |
| 26 | Duplicate booking submission doesn't double-create referral | **V** | 2-minute dedup window returns existing booking before reaching the referral-insert code (`app/api/bookings/route.ts:303-334`) |
| 27 | Fare/price server-trusted, not client-trusted | **V** | `app/api/bookings/route.ts:340-342`; re-verified again at payment layer (`verification-validator.ts`, `finalize_payment` RPC) |
| 28 | Webhook signature verified | **V** | HMAC-SHA256 over raw body, timing-safe compare (`app/api/payments/webhook/route.ts:58-83`) |
| 29 | Webhook/payment idempotent | **V** | `payment_events.idempotency_key` UNIQUE + `finalize_payment` row-lock + explicit replay handling |
| 30 | Commission created exactly once per booking | **V** | `referrals.booking_id UNIQUE`; duplicate-booking guard prevents the insert code from running twice in the first place |
| 31 | Commission tied to payment confirmation | **F (by design gap)** | Commission is created at **booking submission**, not at payment confirmation — exists even for entirely unpaid bookings |
| 32 | "Pay later" handled distinctly for commission purposes | **F** | Commission creation doesn't check `bookingType`/payment method at all |
| 33 | Cancelled/refunded booking reverses commission | **F (critical)** | No code path anywhere updates `referrals`/`commission_status` on booking cancellation; `wallet_transactions` has a `commission_reversal` type defined but it's never written to by any code |
| 34 | Ambassador dashboard shows only own data | **V** | Server resolves ambassador ID from session email/user_id, never from client input (`app/api/referrals/route.ts:56-78`) |
| 35 | Ambassador cannot approve own commission | **V** | `PATCH /api/commissions` requires `requireAdminUser`, which rejects the `ambassador` role |
| 36 | Ambassador cannot edit commission rates | **V** | Same admin-only gate on `/api/commission-rules` |
| 37 | Ambassador self-profile edit works | **F (functional bug)** | UI calls `PATCH /api/ambassadors/[id]`, which is `requireAdminUser`-gated — a real ambassador gets rejected editing their own profile |

---

## 8. Referral Link & Attribution — Detailed Findings

This is the highest-priority area of the whole audit.

**AMB-001 (Critical) — Referral links do not attribute bookings.**
The system generates and emails links of the form `{origin}/book?ref={CODE}` from five separate places (`app/api/ambassadors/route.ts:313`, `app/api/ambassadors/resend/route.ts:39`, `app/api/applications/review/route.ts:147`, `app/admin/components/AmbassadorCreationWizard.tsx:78`, `app/admin/page.tsx:1711`, and it's what's shown on the ambassador dashboard at `app/ambassador/(protected)/dashboard/page.tsx:13`). But:
- `app/book/page.tsx:13-20` types `searchParams` as exactly `{ departure, university, date, seats }` — `ref` isn't in the type and is never read.
- `app/page.tsx` (the component `/book` actually renders) never calls `useSearchParams()` or reads `window.location.search`. Its `referralCode` form field starts at `""` (`app/page.tsx:76`) and is populated **only** by a customer manually typing into the "Referral Code (optional)" input inside `app/components/home/BookingModal.tsx:89`.
- **Confirmed live:** fetching `https://www.travelwithhawkins.com/book?ref=TESTCODE123` shows a normal booking form with zero visual, functional, or field-level acknowledgement of the `ref` parameter.

Net effect: today, an ambassador can share a link, and it will do *nothing* — the customer still has to know to look for, and manually type, a separate referral code. This defeats the entire "share your link, earn commission" value proposition the rest of the system (email templates, dashboard copy, admin messaging) is built around.

**AMB-003 (Critical) — No self-referral prevention.** `app/api/bookings/route.ts:353-371` only checks that the code maps to an *active* ambassador — it never compares the ambassador's identity (email/phone/user_id) against the booker's. An ambassador can book their own trip with their own code and receive commission credit.

**AMB-013 (Medium) — Ambassador identity fallback by name match.** When the session email doesn't match any `ambassadors.email` row, `app/api/referrals/route.ts:65-71` falls back to matching on `full_name` (`.eq("full_name", profileName)`). Two ambassadors sharing a common name (plausible at a single university) could have their referral lists cross-resolved incorrectly. Recommend removing this fallback in favor of a hard `user_id`/`profile_id` linkage established at account-creation time.

**No persistence/TTL policy (informational, not a defect on its own — it's a consequence of AMB-001).** Because there is no cookie/localStorage/sessionStorage use anywhere for referral state, there's no "first-click vs. last-click" attribution policy, and no expiry window, because there's nothing to expire. Fixing AMB-001 will require deciding this policy (recommendation in §16).

**Referral code generation (Verified, not a security defect, but flagged for UX).** `app/api/ambassadors/route.ts:107-111,155` generates codes as `SLUG(full_name) + "01"` (e.g., "Ted Zulu" → `TEDZULU01`), not the `TH-MZU-00001` format assumed in the brief — no such format exists anywhere in the codebase. Uniqueness is enforced by a real DB `UNIQUE` constraint (collisions return HTTP 409), but the suffix is hardcoded `"01"`, not incremented, so a second ambassador with an identical name will collide and require manual admin intervention (a custom code) rather than auto-resolving.

---

## 9. Commission Formula & Manual Recalculation

**Formula, traced end-to-end from `app/api/bookings/route.ts:54-99` (`resolveCommissionAmount`):**

```
rule = active row in commission_rules where route_name matches the booking's destination
       (case-insensitive, whitespace-trimmed match; no fuzzy matching)

if rule.commission_type == "percentage":
    commission = round(fare * rule.commission_amount / 100)     // fare = transport fare, NOT booking fee
else:  // "fixed" (default when commission_type column/value absent)
    commission = rule.commission_amount                          // flat MWK amount
```

- **Base:** transport fare (`bookings.fare`), never the booking fee, never a "total paid" figure.
- **Trigger for creation:** booking submission (`POST /api/bookings`), **before any payment** — not payment confirmation, not the webhook.
- **Trigger for "payable":** 100% manual — an admin must `PATCH /api/commissions` with `commissionStatus: "approved"` then `"paid"`. No automated trigger exists anywhere (no webhook, no DB trigger, no cron).
- **Snapshot vs. live:** the computed amount is written directly into both `bookings.commission_amount` and `referrals.commission_amount` at creation time — every later read (`GET /api/commissions`, `GET /api/referrals`, the ambassador dashboard) selects those stored columns directly, with **no** join back to `commission_rules`. Changing a rate later does **not** retroactively change past commissions. This is correct behavior for a rate change, but note it also means there is no audit trail linking a stored commission back to which rule/version produced it.
- **Rounding:** `Math.round()` for percentage-type commissions (nearest whole MWK); no rounding logic for fixed-type (used as-is).
- **Currency storage inconsistency (AMB-018, Medium):** `payments`/`wallet_transactions` store amounts as `BIGINT` (whole MWK; `verification-validator.ts` explicitly rejects non-integer amounts), while `referrals.commission_amount`/`bookings.commission_amount`/`commission_rules.commission_amount` are `NUMERIC(12,2)` (decimals allowed). Two different precision models for money in the same system.

**Manual recalculation** using the formula above and the seed data in `referral_system_migration.sql:255-261` (the only commission-rule values found anywhere in the repo — **actual live `commission_rules` table contents were not queried**, since this audit had no database access; treat the following as a formula-correctness check, not a claim about current production rates):

| Route | Rule (seeded) | Fare used | Computed commission | Formula check |
|---|---|---|---|---|
| Mzuzu → Lilongwe | 2,000 MWK, fixed | irrelevant (fixed) | 2,000 MWK | `resolveCommissionAmount` returns `rule.commission_amount` unchanged — **correct** |
| Mzuzu → Blantyre | 2,500 MWK, fixed | irrelevant (fixed) | 2,500 MWK | same as above — **correct** |
| Hypothetical: 10% percentage rule | 10, percentage | 20,000 MWK | `round(20000 × 10 / 100)` = 2,000 MWK | Arithmetic matches code exactly — **correct** |
| Hypothetical: 10% percentage rule | 10, percentage | 20,033 MWK | `round(20033 × 10 / 100)` = `round(2003.3)` = 2,003 MWK | Rounding behaves as documented (round-half-away-from-zero via JS `Math.round`) — **correct**, no discrepancy found |

**The formula itself is implemented correctly and consistently with the schema.** The defects are all in the *lifecycle* around it, not the arithmetic:

**AMB-002 (Critical) — No commission reversal on cancellation/refund.** `PATCH /api/bookings` (`app/api/bookings/route.ts:491-535`) only ever updates `bookings.status`/`payment_status`/`payment_notes` — it never touches `referrals` or `commission_amount`/`commission_status`. `wallet_transactions.transaction_type` includes a `'commission_reversal'` enum value (`db/migrations/2026_08_01_payments_wallet_audit_foundation.sql:194`) suggesting this was *planned*, but a repo-wide search found **zero code that ever writes to `wallet_transactions`** — the ledger table is pure dead schema. A booking can be cancelled by an admin while its referral commission sits at `pending` (or gets manually approved later) indefinitely, with nothing to stop it being paid out.

**AMB-016 (High) — Commission creation and approval are fully decoupled from payment status, with no visibility for the approver.** A referred booking gets a `commission_status='pending'` row the instant it's submitted, regardless of whether the customer ever pays the booking fee or fare, and regardless of "pay now" vs. "pay later"/cash. `GET /api/commissions` (`app/api/commissions/route.ts:16-19`) returns `referrals.*, ambassadors(...)` with **no join to `bookings`** — so the admin approving a commission has no payment-status column available in that response to check against. (Whether the admin UI separately fetches and cross-references booking status was not verified in this pass — flagged as **Blocked from testing** for the UI-level check specifically; the API-level gap is Verified.)

---

## 10. Security Review

**IDOR — none found (Verified).** Every ambassador-facing data endpoint reviewed (`/api/referrals`, `/api/profile`) resolves the caller's own ambassador/profile ID strictly from the authenticated session (email or `user.id` lookup) — never from a client-supplied query parameter or request body field. `app/api/ambassadors/[id]/route.ts` does accept a path-parameter ID, but that route is `requireAdminUser`-gated, so cross-ambassador access there is an intended admin capability, not a vulnerability.

**Client-side price/commission manipulation — not possible (Verified).** Fare is always resolved server-side from `settings.routes`/`route_objects`, with a client-submitted fare only used as a last-resort fallback when the route isn't found server-side. Booking fee is always server-resolved, never client-supplied. Payment amounts are re-verified against the stored `expected_amount` both in `verification-validator.ts` and again inside the `finalize_payment` Postgres RPC. Commission status changes require `requireAdminUser`; ambassadors cannot self-approve.

**Webhook security — correctly implemented (Verified).** `app/api/payments/webhook/route.ts:58-83` computes HMAC-SHA256 over the *raw* request body using `PAYCHANGU_WEBHOOK_SECRET` and compares it to the `signature` header using a timing-safe comparison, before any JSON parsing happens. This route is deliberately excluded from Supabase-session auth in `middleware.ts:51` with a code comment explaining the HMAC is the intended control — appropriate for a server-to-server webhook.

**Payment idempotency — correctly implemented (Verified).** `payment_events.idempotency_key` has a real `UNIQUE` constraint; the webhook route claims events atomically via a conditional status update before processing, and the `finalize_payment` RPC additionally row-locks the `payments` record and distinguishes a consistent replay (`already_finalized`) from a contradictory one (`rejected`) rather than blindly re-applying.

**Service-role key exposure — none found (Verified).** `SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix) is only referenced from `lib/supabaseAdmin.ts` and server-only files under `app/api/**/route.ts`; none of the ~33 files that import it carry a `"use client"` directive.

**AMB-005 (Critical, needs live-DB verification) — overly permissive INSERT policy on `ambassador_applications`, if that version of the schema is live.** `referral_system_migration.sql:313-318` defines `applications_public_insert` as `FOR INSERT TO authenticated WITH CHECK (true)` — this places **no restriction on row contents**, meaning any authenticated user (not necessarily an admin) could theoretically insert an application row with `status` pre-set to `'approved'`, bypassing review entirely, **if this is the RLS policy set actually active in production**. Whether it is depends on migration run order relative to the competing `db/ambassador_applications_migration.sql`, which explicitly does *not* enable RLS at all (see AMB-005 detail in §11). Note that in current practice this may be moot: the application submission path in the app itself always goes through the service-role client (`app/api/applications/route.ts`), so this RLS policy would only matter if a client ever called Supabase directly with the anon/authenticated key — which was not found anywhere in the reviewed code, but should still be closed as defense-in-depth.

**AMB-008 (High) — No rate limiting or anti-spam on the public application endpoint.** `POST /api/applications` doesn't call `isRateLimited()` (unlike bookings, cash-fare selection, payment status, and the tracking endpoint, which all do). Combined with the lack of duplicate detection (AMB-007), this endpoint is open to unthrottled scripted submission, including repeated base64 profile-photo uploads with no server-side size cap (only the client enforces the 5MB limit; the server only regex-validates the data-URL *format*, not its size).

**AMB-012 (High) — Rate limiting is process-local in-memory state.** `lib/rateLimit.ts:6` uses a plain in-process `Map`. In any horizontally-scaled or serverless deployment (multiple Next.js server instances/function invocations, which is the norm for Vercel-style hosting), each instance has its own independent bucket — a client distributed across instances (or one whose requests simply land on a fresh function invocation) can exceed the intended 20-requests/60-seconds limit many times over. This affects every route that depends on `isRateLimited`, including booking creation and payment status polling, not just ambassador flows specifically.

**Static security checks performed:** grepped for raw SQL string concatenation (all DB access goes through the Supabase client's parameterized query builder — no hand-built SQL/string interpolation into queries was found in the ambassador/referral/payment code paths), grepped for `dangerouslySetInnerHTML`/`eval` in ambassador-related components (none found), confirmed no secrets are logged in plaintext in the reviewed error-handling code (though `app/ambassador/apply/page.tsx:280` does forward the raw API error-response text to the UI verbatim, which could leak an internal Postgres/Supabase error string to the end user if one occurs — low severity, recommend generic user-facing error copy).

**Not independently tested this session (Blocked):** live CSRF behavior, live open-redirect probing, live SQLi/XSS probing against the production site (per the read-only/non-destructive constraint, no adversarial payloads were sent to production — the static code review found no obvious injection vectors, but this is Inferred, not Verified by dynamic testing).

---

## 11. Database Integrity Review

All findings below come from a full read of every SQL file in the repository. **A repeated, cross-cutting theme: several core tables (`bookings`, `settings`, `admins`) are never `CREATE TABLE`'d in any tracked migration** — they were created directly against production outside the migration history that ships with this repo, which is itself a process risk (schema drift, no single source of truth) independent of any specific bug below.

**AMB-004 (Critical, needs live verification) — invalid PostgreSQL syntax in two migration files.**
- `referral_system_migration.sql:184-189` — `CREATE POLICY profiles_self_read_update ... FOR SELECT, UPDATE ...`. Postgres's `CREATE POLICY` `FOR` clause accepts exactly one value; a comma list is a syntax error. If this file was run as-written, **this specific policy does not exist in the database.**
- `db/communication_center_migration.sql` — uses `CREATE POLICY IF NOT EXISTS` twelve times (lines 190, 204, 207, 213, 224, 227, 233, 236, 256, 263, 266, 279). Postgres's `CREATE POLICY` does not support `IF NOT EXISTS` (unlike `CREATE TABLE`/`CREATE INDEX`) — all twelve statements are syntax errors.

Why this matters beyond the profiles table itself: almost every other "admin full access" RLS policy in this schema works by subquerying `profiles` for the caller's own row (`EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')`). If `profiles_self_read_update` never got created, no non-service-role caller could read their own `profiles` row via RLS, which could make every one of those "is admin" checks evaluate false for everyone when accessed via the anon/authenticated key. **In practice, this is likely non-critical for the app's own functionality today**, because every admin/ambassador authorization check in the application code (`lib/supabaseServer.ts`) uses the **service-role client**, which bypasses RLS entirely — the app doesn't rely on RLS to authorize its own requests. RLS only matters here as a *second, independent* line of defense in case the anon/authenticated key is ever queried directly from a browser client (which this audit did not find happening anywhere in the current codebase) or a future feature adds such a call. **This must be verified directly against the live database** (`SELECT * FROM pg_policies WHERE tablename IN ('profiles', ...)`) before relying on it either way — it was not possible to check from static files alone.

**AMB-005 (Critical, needs live verification) — `ambassador_applications` defined twice, incompatibly.** `db/ambassador_applications_migration.sql` (standalone, explicitly instructs *not* to enable RLS) and `referral_system_migration.sql:264-347` (enables RLS with 5 policies, adds a dedupe unique index) both use `CREATE TABLE IF NOT EXISTS` for the same table — whichever ran first "wins" for column definitions, and the final production schema depends on undocumented run order. `db/README.md` only documents the standalone file and gives no run-order guidance. This must be checked directly against the live schema (`\d ambassador_applications`, `SELECT * FROM pg_policies WHERE tablename='ambassador_applications'`).

**AMB-015 (High, needs live verification) — RLS policies reference a column that may not exist.** `db/migrations/2026_08_01_payments_wallet_audit_foundation.sql:284,290,302` write RLS policies for `payout_requests`/`wallet_transactions` using `a.user_id = auth.uid()` against the `ambassadors` table — but no `CREATE TABLE public.ambassadors` in any tracked migration ever defines a `user_id` column (only `profile_id`). Either these three policies fail outright when run, or production's `ambassadors` table has an undocumented `user_id` column not reflected in any committed migration. Given that `wallet_transactions`/`payout_requests` are also confirmed dead (unused by any app code — AMB-014), this is lower practical urgency but should be resolved before building a real payout feature on top of this schema.

**AMB-014 (High) — the "payout" schema exists but is entirely disconnected from the app.** `wallet_transactions`, `payout_requests`, and a `ambassador_wallet_balances` view are all defined in `2026_08_01_payments_wallet_audit_foundation.sql` with sensible design (a `security_invoker` balance view summing a ledger, a partial-unique-index limiting one active payout request per ambassador). But a repo-wide search found **no application code that ever inserts into `wallet_transactions` or `payout_requests`**. The only thing that currently changes when an admin "pays" a commission is `referrals.commission_status = 'paid'` — a label with no linked payment record, no payout reference, and no audit trail beyond whatever generic logging exists. **There is no real ambassador payout system today** — this should be stated plainly to stakeholders, since the schema's existence could easily be mistaken for a working feature (as the stale `AMBASSADOR_SYSTEM_ANALYSIS.md` in the repo root already does, listing "Commission payment workflow" as merely "partially implemented" rather than "not implemented").

**AMB-020 (Medium) — RLS never enabled on `ambassador_activity_logs` or `notifications`.** Confirmed directly: `referral_system_migration.sql:169-174`'s `ENABLE ROW LEVEL SECURITY` block lists `profiles`, `ambassadors`, `referrals`, `commission_rules`, `commission_transactions`, `manifests` — it does **not** include `ambassador_activity_logs` or `notifications`, both defined earlier in the same file (lines 114-129). No other file enables RLS on them either. Exposure to the `anon`/`authenticated` API roles depends entirely on Supabase's project-level default grants, which was not verified this session — flagged for direct confirmation, since `notifications` stores per-user `title`/`message` content.

**AMB-021 (Low) — `commission_transactions` is dead schema.** The authors of `2026_08_01_payments_wallet_audit_foundation.sql` note in their own migration comments (lines 13-17) that this table, defined in `referral_system_migration.sql`, was checked against the live database and confirmed to **never have been applied to production**. It's effectively decorative — a real, if minor, source of confusion for anyone reading the schema cold.

**Other integrity notes (Verified from static files):**
- Cascade chain `auth.users → profiles → ambassadors → {wallet_transactions, payout_requests, commission_transactions, manifests, ambassador_activity_logs}` is all `ON DELETE CASCADE`. Deleting a user permanently destroys their entire financial ledger/payout history — inconsistent with `payments.ambassador_id`/`payments.customer_id`, which correctly use `ON DELETE SET NULL` to preserve payment records. Recommend `SET NULL` (with an audit-log entry) rather than `CASCADE` for anything financial.
- `commission_rules.route_name` has no unique constraint — duplicate/conflicting rules for the same route are possible at the DB level (application code takes the first match found, silently ignoring any duplicates).
- `add_role_constraints_to_profiles.sql` adds a `CHECK` constraint including `'super_admin'`/`'viewer'` without an `IF NOT EXISTS`/name-collision guard, while `referral_system_migration.sql`'s inline `role` check (only `admin`/`ambassador`/`customer`) would auto-generate the identical constraint name — in a fresh run these are likely to conflict. In practice, this may matter less than it looks, since admin-role resolution in the app primarily consults a separate `admins` table before ever falling back to `profiles.role` (`lib/supabaseServer.ts:37-81`) — but the constraint conflict should still be cleaned up.
- The customer-authentication migration (`customer_authentication_system.sql:329-359`) defines `link_guest_bookings_to_customer()`, called automatically via an `AFTER INSERT` trigger on `customer_profiles`, using `ON CONFLICT (customer_id)` — but `guest_booking_links.customer_id` has no matching unique constraint anywhere in the file, only a plain index. This is outside the ambassador system proper, but is a concrete, high-confidence functional bug (any customer signup matching an existing guest booking's email would throw at the DB layer) worth flagging since it touches the same account-creation code paths.

---

## 12. Admin Workflow Findings

**Works as intended (Verified):** application listing/filtering by status, applicant detail view, approve → automatic ambassador account creation (auth user + profile + ambassador row + referral code, all in one transaction-like request), reject with optional reason, ambassador CRUD (`app/api/ambassadors/route.ts`), commission status PATCH, commission-rule management — all gated by `requireAdminUser()`, independently re-verified per route (§10).

**Gaps (Verified):**
- **AMB-010 (High):** No status guard prevents re-approving an already-`approved` or already-`rejected` application. Concurrent double-approval by two admin sessions is possible (Supabase Auth's own email-uniqueness constraint prevents a duplicate *auth user*, but nothing prevents duplicate welcome emails / re-writing `reviewed_at`/`reviewed_by_id` / re-running side effects).
- **AMB-011 (Medium):** Rejection reason is optional (`window.prompt("Reason for rejection (optional)")`), contradicting the brief's expectation that a reason be recorded.
- No bulk-action support was found for applications (single-row approve/reject only) — not a defect, just confirming absence per the checklist.
- No export/CSV feature was found for referral or commission data in the routes reviewed (`lib/csvUtils.ts` exists but a targeted check of whether it's wired into the referrals/commissions admin pages was not completed this session — **Blocked/unconfirmed**, flagged for follow-up rather than asserted either way).

---

## 13. Ambassador Dashboard Findings

**Verified working:** login, own-data-only dashboard (referrals, commission totals broken into pending/approved/paid, referral code display), sign-out. Dashboard stats (`app/ambassador/(protected)/dashboard/page.tsx:32-40`) are computed client-side by reducing over the exact same `referrals` rows the (session-scoped) API already returned — there's no separate cached total to drift from the underlying rows, so **dashboard totals matching the database is Verified by construction**, not just assumed.

**Verified broken:** self profile editing (AMB-017 — `PATCH /api/ambassadors/[id]` is admin-only, so the ambassador-facing profile page's save action will fail for a real ambassador user).

**UI/UX finding — AMB-019 (Low):** the dashboard's "Passenger manifest" card has three buttons — "Print manifest," "Download PDF," "Share" (`app/ambassador/(protected)/dashboard/page.tsx:165-167`) — with **no `onClick` handlers at all**. They render as inert, misleading UI.

**Correctly restricted (Verified):** ambassadors cannot view other ambassadors' referrals (session-scoped query), cannot change their own commission rate, cannot self-approve/self-mark-paid a commission, cannot forge booking/payment status (no client-writable fields for these), cannot directly create commission records (no client-reachable insert path into `referrals`).

**Privacy note (not a defect, worth reviewing):** the ambassador dashboard surfaces `customer_name` and `customer_phone` for every booking referred through that ambassador (`referrals` table columns, returned as-is by `/api/referrals`). This is plausibly necessary for an ambassador to "follow up with their referred clients" as the brief expects, but it means a phone number is visible to a non-employee (a student ambassador) — worth an explicit privacy-policy decision rather than an implicit one.

---

## 14. UI/UX Review

| Area | Observation | Impact | Priority |
|---|---|---|---|
| Referral link sharing | Link is generated and displayed but functionally inert (AMB-001) | Ambassadors will share something that doesn't work, damaging trust in the program from day one | P0 |
| Booking modal referral field | Manual-entry-only "Referral Code (optional)" field is the *only* working attribution path, but it's not visually connected to "you were referred by an ambassador" messaging anywhere on the site (confirmed via live fetch of `/book?ref=...` — no banner, no acknowledgement UI at all) | Customers arriving via a shared link have no idea they need to type anything | P0 (tied to AMB-001 fix) |
| Ambassador application form | Confirmed live: clean 4-step layout, clear "Step X of 4" progress, required-field marking present | Positive finding — no action needed | — |
| Application submit error handling | Raw server error text is surfaced verbatim to the user (`app/ambassador/apply/page.tsx:280`) | Could leak internal error detail; unpolished UX on failure | P2 |
| Rejection reason capture | Uses a native `window.prompt()` dialog rather than an in-page form field | Inconsistent with the rest of the admin UI's modal/dialog patterns; easy to accidentally cancel and lose the reason | P2 |
| Ambassador dashboard manifest actions | Three dead buttons (Print/Download/Share) with no handlers (AMB-019) | Looks broken to an end user; erodes trust in the rest of the dashboard | P2 |
| Ambassador self-profile editing | Save action will error out for real ambassadors (AMB-017) | Ambassadors can't update their own contact info without going through an admin | P1 |
| Commission approval visibility | Admin-facing commission list has no payment-status column available from its own API response (AMB-016) | Admin could approve a commission for a booking that was never actually paid for | P1 |

No further live UI/UX testing (mobile breakpoints, keyboard navigation, color contrast, touch targets) was performed this session beyond the two read-only page loads described in §2 — those specific checks are **Blocked from testing** and would need either a real browser session against a non-production environment or explicit authorization to interact more extensively with the live production site.

---

## 15. Build, Lint, Type-Check, and Test Results

All commands run exactly as defined in `package.json` (no invented script names), from the repository root.

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` (`tsc --noEmit`) | **Pass** | Initial run failed on a stale, truncated auto-generated file (`.next/dev/types/validator.ts`, left over from a prior `next dev` session) — this is a build cache artifact, not source code. Removed the stale `.next/dev/types` directory (safe: it's fully regenerable, not tracked in git, not user work) and re-ran; clean pass with zero errors. |
| `npm run lint` (ESLint) | **25 errors / 23 warnings, repo-wide** | None of the errors are in ambassador/referral/commission/payment code specifically — they're concentrated in `app/customer/login/page.tsx` (a React-hooks rule violation + unescaped-entity errors), `app/customer/settings/page.tsx` (`any` type), and several `require()`-style imports in root-level one-off scripts (`insert-customer-profile.js`, `temp-insert-customer*.js` — these look like ad hoc debug scripts, not part of the app). The only ambassador-adjacent lint hits are minor unused-variable **warnings** in `app/api/referrals/route.ts` and `app/api/reports/route.ts` — no errors. |
| `npm test` (`node --test` over `lib/phoneNumbers.test.mjs`, `lib/payments/reference.test.ts`, `lib/payments/verification-validator.test.ts`) | **Pass — 36/36** | All existing tests pass. Coverage is entirely payment-reference-generation and payment-verification logic; **zero tests exist for ambassador, referral, application, or commission code** — this whole area of the system has no automated test safety net today. |
| `npm run build` (`next build`, Turbopack) | **Compiled successfully** (3.0 min) | Production build compiles cleanly. Next.js also emitted a deprecation warning: *"The 'middleware' file convention is deprecated. Please use 'proxy' instead."* — not an error, but worth planning a migration given this repo is already running a Next.js version ahead of the assistant's training data (per `AGENTS.md`'s own warning) and deprecations tend to become breaking removals in subsequent majors. |

---

## 16. Confirmed Defects, Missing Functionality, and Recommendations Summary

| ID | Area | Finding | Severity | Status | Evidence | Recommended action |
|---|---|---|---|---|---|---|
| AMB-001 | Referral attribution | `?ref=` links are generated everywhere but never read by the booking page | **Critical** | Confirmed (code + live site) | `app/book/page.tsx:13-20`, `app/page.tsx`, live `/book?ref=TESTCODE123` | Parse `ref` in `app/book/page.tsx`/`app/page.tsx`, persist it (short-TTL cookie recommended), pre-fill and lock the booking modal's referral field, show a "Referred by..." confirmation banner |
| AMB-002 | Commission integrity | No commission reversal on booking cancellation/refund | **Critical** | Confirmed (code) | `app/api/bookings/route.ts:491-535`; `wallet_transactions` unused | Add cancellation/refund hook that flips `commission_status` to `cancelled` (the schema already supports this value) |
| AMB-003 | Referral fraud | No self-referral prevention | **Critical** | Confirmed (code) | `app/api/bookings/route.ts:353-371` | Compare ambassador's email/phone against booker's before attributing |
| AMB-004 | DB migrations | Invalid RLS `CREATE POLICY` syntax (`FOR SELECT, UPDATE`; `CREATE POLICY IF NOT EXISTS` ×12) | **Critical** | Confirmed syntax error in file; **live effect unverified** | `referral_system_migration.sql:184-189`; `db/communication_center_migration.sql` | Fix syntax, then run `SELECT * FROM pg_policies` against production to confirm actual policy state before trusting any RLS-based control on these tables |
| AMB-005 | DB migrations | `ambassador_applications` defined twice incompatibly; possible `WITH CHECK(true)` INSERT policy allowing arbitrary `status` | **Critical** | Confirmed conflict in files; **live schema unverified** | `db/ambassador_applications_migration.sql` vs `referral_system_migration.sql:264-347` | Consolidate into one canonical migration, verify live schema, ensure INSERT policy forces `status='pending'` |
| AMB-006 | Application form | No server-side phone format validation (Malawi or any) | High | Confirmed | `app/api/applications/route.ts:29`; `app/ambassador/apply/page.tsx:92-94` | Reuse `lib/phoneNumbers.ts` (already used/tested for bookings) to validate server-side |
| AMB-007 | Application form | No duplicate-application prevention (no unique constraint, no server check) | High | Confirmed | `db/ambassador_applications_migration.sql`; `app/api/applications/route.ts` | Add `UNIQUE(LOWER(email))` and/or `UNIQUE(student_id)`; check before insert |
| AMB-008 | Application form | No rate limiting/anti-spam on submission | High | Confirmed | `app/api/applications/route.ts` (no `isRateLimited` call) | Wire in `lib/rateLimit.ts` (and fix AMB-012 first) or add CAPTCHA |
| AMB-009 | Application form | No server-side double-submission idempotency | High | Confirmed | `app/api/applications/route.ts` | Add an idempotency key or short server-side de-dup window like bookings already have |
| AMB-010 | Admin workflow | No guard against re-processing an already-decided application; admin race condition | High | Confirmed | `app/api/applications/review/route.ts:150-439` | Add `WHERE status = 'pending'` guard (single UPDATE...RETURNING) before proceeding |
| AMB-011 | Admin workflow | Rejection reason optional, collected via `window.prompt()` | Medium | Confirmed | `app/admin/applications/page.tsx:274` | Make required; use a proper modal form field |
| AMB-012 | Infrastructure | In-memory rate limiter doesn't work across multiple server instances | High | Confirmed | `lib/rateLimit.ts` | Move to a shared store (Supabase table, Redis, Upstash) if deployed on more than a single long-lived instance |
| AMB-013 | Referral dashboard | Ambassador identity fallback by `full_name` string match risks cross-ambassador data mixing | Medium | Confirmed | `app/api/referrals/route.ts:65-71` | Remove name-based fallback; require a hard `user_id` link set at approval time |
| AMB-014 | Payouts | `wallet_transactions`/`payout_requests` schema exists but zero app code writes to it — no real payout system exists | High | Confirmed | repo-wide search, `2026_08_01_payments_wallet_audit_foundation.sql` | Either build the payout feature on the existing schema or remove it to avoid confusion; don't let "paid" commission status imply a real payout occurred |
| AMB-015 | DB migrations | RLS policies reference `ambassadors.user_id`, a column not defined in any tracked migration | High | Confirmed in files; **live schema unverified** | `2026_08_01_payments_wallet_audit_foundation.sql:284,290,302` | Verify live schema; align migration with reality |
| AMB-016 | Commission workflow | Commission creation/approval fully decoupled from payment status; admin approval API has no payment-status visibility | High | Confirmed (API); UI-level check **blocked** | `app/api/commissions/route.ts:16-19`; `app/api/bookings/route.ts` (commission creation) | Join booking payment status into the commission list API/UI; consider gating "approved" on `booking_fee_status`/`fare_status` |
| AMB-017 | Ambassador dashboard | Ambassador self-profile edit calls an admin-only endpoint and will fail | Medium | Confirmed | `app/ambassador/(protected)/profile/page.tsx:65` vs `app/api/ambassadors/[id]/route.ts:114-117` | Add an ambassador-scoped self-edit endpoint (or relax the guard with an ownership check) |
| AMB-018 | Data model | Currency stored as `BIGINT` in payments/wallet tables but `NUMERIC(12,2)` in referrals/bookings/commission_rules | Medium | Confirmed | multiple migrations | Standardize on integer MWK everywhere financial |
| AMB-019 | Ambassador dashboard | Dead "Print/Download/Share manifest" buttons, no handlers | Low | Confirmed | `app/ambassador/(protected)/dashboard/page.tsx:165-167` | Implement or remove |
| AMB-020 | DB security | RLS never enabled on `ambassador_activity_logs`/`notifications` | Medium | Confirmed in files; **live exposure unverified** | `referral_system_migration.sql:169-174` (omission) | Enable RLS + policies, or confirm Supabase default grants already restrict access |
| AMB-021 | DB hygiene | `commission_transactions` table is dead/never applied to production | Low | Confirmed (author's own migration comment) | `2026_08_01_payments_wallet_audit_foundation.sql:13-17` | Remove from `referral_system_migration.sql` or formally deprecate |
| AMB-022 | Referral codes | Code format is `NAME+"01"`, not incremented, collision-prone for common names | Low | Confirmed | `app/api/ambassadors/route.ts:107-111` | Use a real sequence/random suffix instead of hardcoded "01" |
| AMB-023 | Application form | No configurable application closing date/window | Low | Confirmed absent | repo-wide search | Add if business needs a hard cutoff; not currently needed for correctness |
| AMB-024 | Storage | `communication-attachments` bucket is public | Low (tangential) | Confirmed | `db/communication_center_migration.sql:174-176` | Switch to signed URLs if attachments may contain sensitive info |
| AMB-025 | Documentation | `AMBASSADOR_SYSTEM_ANALYSIS.md` is stale and contradicts the current, more-complete implementation | Low | Confirmed | file dated 2026-07-23 vs. current code | Update or remove to avoid misleading future readers |
| AMB-026 | Architecture | Middleware doesn't independently enforce admin role on API routes (relies entirely on each handler) | Low (not currently exploited) | Confirmed | `middleware.ts:57-96` | Consider adding a defense-in-depth role check at the middleware layer for `isAdminApiRoute` |

---

## 17. Final Readiness Assessment

Answering the brief's specific questions directly, each labeled by verification status:

- **Does the ambassador application form work end-to-end?** Mostly — submission, storage, and fully-automated account provisioning on approval all work (**Verified**). Server-side validation is weak and duplicate/spam protection is absent (**Verified gap**).
- **Can admins correctly approve or reject applicants?** Yes, functionally (**Verified**), but without safeguards against double-processing or enforced rejection reasons (**Verified gap**).
- **Is an ambassador account and role created safely?** Yes — properly gated, server-side, atomic-enough creation of auth user + profile + ambassador row (**Verified**).
- **Are referral codes unique and valid?** Yes, DB-enforced (**Verified**); format is predictable/collision-prone but that's a UX issue, not a security one, since codes are meant to be shared publicly.
- **Does the ambassador referral link actually work?** **No.** Confirmed broken in code and on the live production site (**Verified — Failed**).
- **Does referral attribution survive the complete booking journey?** For manually-typed codes, the server re-validates correctly at submission (**Verified**), but nothing survives a page refresh or navigation because no persistence mechanism exists at all (**Verified — Failed** for the "survives the journey" requirement).
- **Is the correct ambassador saved on the booking?** Yes, when a code is present — resolved and validated entirely server-side, not client-trusted (**Verified**).
- **Do guest and logged-in bookings both support referrals?** Yes, the booking/referral path doesn't distinguish customer auth state (**Inferred from code**).
- **Does "Pay later" behave correctly?** Booking itself works, but commission creation doesn't distinguish it from an online payment — a commission is created regardless (**Verified gap**, not a hard break, but a real business-logic risk).
- **Does a successful PayChangu test payment update the correct booking?** The code path is well-built and internally consistent (**Verified from code**: correct booking lookup, row locking, idempotent finalize RPC) but **could not be exercised live** — no isolated test environment was available to trigger a real (even sandboxed) payment without touching production data (**Blocked from testing**).
- **Is a commission created exactly once?** Yes, per the DB unique constraint and the booking-level duplicate-submission guard (**Verified**) — but it's created at booking time, not payment time, which is itself a defect (AMB-016).
- **Is the commission formula mathematically correct?** Yes — manually recalculated and matches the code exactly for both fixed and percentage rule types (**Verified**, §9).
- **Are failed/cancelled/abandoned/refunded bookings excluded or reversed correctly?** **No.** No reversal logic exists anywhere (**Verified — Failed**, AMB-002).
- **Do ambassador dashboard totals match the database?** Yes, by construction — computed directly from the same session-scoped rows the API returns (**Verified**).
- **Do admin referral totals match the database?** Very likely, by the same mechanism, but the admin referral-totals page itself was not read line-by-line this session (**Inferred, not independently confirmed**).
- **Is customer information protected?** Reasonably — ambassadors see only their own referred customers' name/phone, scoped server-side (**Verified**); one open question about `ambassador_applications` RLS pending live-DB confirmation (AMB-005).
- **Can ambassadors access only their own records?** Yes, with one caveat (name-matching fallback, AMB-013) (**Verified, with a flagged edge case**).
- **Can commission or payment data be manipulated from the client?** No — every mutation path is properly server-gated (**Verified**).
- **Is the system ready to support more than 1,000 referred students?** The main structural blocker isn't scale — it's that the referral *link* mechanism itself doesn't work (AMB-001), so a real campaign built on link-sharing would fail from day one regardless of volume. The in-memory rate limiter (AMB-012) is the one genuine scale concern found.
- **Is the ambassador system ready for launch?**

## **Not ready until critical issues are fixed.**

Primary blockers, in order: AMB-001 (referral links don't work — the core mechanic of the whole program), AMB-002/AMB-003 (commissions aren't reversed on cancellation and self-referral isn't blocked — direct financial exposure), and AMB-004/AMB-005 (migration-file defects whose real production impact cannot be confirmed without direct database access and must be checked before trusting any RLS-based protection on ambassador applications or profiles). The application-intake hardening items (AMB-006 through AMB-011) should be closed before actively promoting the program to avoid a flood of low-quality or duplicate applications.

---

## 18. Recommended Implementation Roadmap

**Phase A — Critical correctness and security** (do before accepting any real referral bookings)
- Fix AMB-001 (referral link attribution), AMB-002 (commission reversal on cancel/refund), AMB-003 (self-referral block).
- Verify AMB-004/AMB-005/AMB-015 directly against the live database and remediate.
- Complexity: **Medium**. Files: `app/book/page.tsx`, `app/page.tsx`, `app/components/home/BookingModal.tsx`, `app/api/bookings/route.ts` (PATCH), migration cleanup files. DB migration required: **Yes** (RLS fixes, commission-cancellation column/trigger if chosen). Risk: **Medium** (touches live booking/referral write paths — test thoroughly in a non-prod environment first, which does not currently exist — see recommendation below). Tests needed: new integration tests for referral persistence and cancellation-reversal; currently zero automated coverage exists for this area.
- **Dependency to call out explicitly:** none of Phase A can be safely *tested* end-to-end without provisioning an isolated Supabase project (or branch) for staging, since the only environment configured today is production. Recommend this as the very first, cheapest step.

**Phase B — Referral and commission reliability**
- AMB-006 through AMB-011 (application-intake hardening), AMB-012 (durable rate limiting), AMB-013 (ambassador identity fallback), AMB-016 (payment-status visibility on commission approval), AMB-018 (currency type consistency).
- Complexity: **Small–Medium** per item. DB migration required: **Yes** for AMB-007 (unique constraints), AMB-018. Risk: **Low–Medium**. Tests needed: unit tests for phone/duplicate validation, integration test for the approval race condition.

**Phase C — Admin and ambassador UI/UX**
- AMB-011 (rejection-reason UX), AMB-017 (ambassador self-edit), AMB-019 (dead manifest buttons), general polish items from §14.
- Complexity: **Small**. DB migration required: **No** (except AMB-017 if a new self-edit endpoint needs ownership columns confirmed). Risk: **Low**.

**Phase D — Analytics, automation, and payout enhancements**
- Decide and build (or formally shelve) AMB-014's real payout system on top of the existing `wallet_transactions`/`payout_requests` schema; automate commission-status transitions tied to payment confirmation rather than pure manual admin action; add the missing test suite for ambassador/referral/commission logic; clean up dead schema (AMB-021) and stale docs (AMB-025).
- Complexity: **Large** (payout system is a genuine new feature, not a fix). DB migration required: **Yes**. Risk: **Medium** (handles real money movement). Dependencies: Phases A–C should land first, especially commission-lifecycle correctness (Phase A/B), before building payouts on top of a commission ledger that isn't yet trustworthy.

---

## 19. Summary for the Requester

- **Overall result:** The ambassador system's account-creation, payment, and access-control foundations are solid and correctly implemented. The referral-link feature at the center of the program — the thing a "campus ambassador" is actually supposed to share — does not work. Commission handling has no cancellation/refund safety net and no self-referral guard.
- **Was the ambassador referral booking link tested?** Yes — both by static code review and by a live, read-only request to the production site. **It does not attribute bookings.** Manual code entry (typing the code into the booking form) is the only path that currently works, and it was verified server-side correct.
- **Are commission calculations correct?** The arithmetic (fixed-amount and percentage formulas) is correct and was manually recalculated against the code. The *lifecycle* around it is not: commissions are created before payment, are never reversed on cancellation, and can be earned via self-referral.
- **P0 findings:** AMB-001 (referral link non-functional), AMB-002 (no commission reversal), AMB-003 (no self-referral prevention), AMB-004 (invalid RLS syntax, needs live verification), AMB-005 (conflicting `ambassador_applications` migrations / possible over-permissive INSERT policy, needs live verification).
- **P1 findings:** AMB-006–AMB-011 (application-intake validation/spam/duplicate/race-condition gaps), AMB-012 (rate limiter won't scale), AMB-014 (no real payout system despite schema suggesting otherwise), AMB-015 (RLS references a possibly-nonexistent column), AMB-016 (commission approval has no payment-status visibility).
- **Report location:** `docs/ambassador-system-audit.md` (this file).
- **Tests that could not be completed, and what's needed:**
  1. Any live functional test that writes data (application submission, booking creation, PayChangu test payment, webhook delivery, cancellation/refund) — **needs an isolated staging Supabase project** (or a Supabase branch) with its own PayChangu test-mode credentials, since only one, production, database is currently configured.
  2. Live confirmation of actual RLS policy state and exact table schema for `profiles`, `ambassador_applications`, `ambassadors` (specifically whether `user_id` exists) — **needs a read-only database credential/session** to run `SELECT * FROM pg_policies ...` / `\d` equivalents against production, which this audit intentionally avoided touching directly.
  3. Whether admin referral-totals pages reconcile with the database, and whether a CSV/export feature exists — **needs a follow-up read of `app/admin/referral-bookings/page.tsx` and related admin components**, not completed this session due to scope/time.
  4. Full mobile/accessibility/keyboard-navigation UI pass — **needs an authorized, more extensive live-browser session** or a non-production environment to click through safely.

**No fixes have been implemented.** This document is findings only, per the engagement instructions. Awaiting review and approval before any implementation work begins.
