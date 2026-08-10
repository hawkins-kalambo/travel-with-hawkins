# Travel with Hawkins — Developer Guide

## Project Overview

**Travel with Hawkins** is a university student transport booking platform. Students book verified routes or custom destinations, referral "ambassadors" earn commission for driving signups, and staff manage trips, payments, and support through an admin portal.

### Tech Stack
- **Frontend/Backend:** Next.js 16 (App Router), React 19, TypeScript (`strict: true`)
- **Styling:** Tailwind CSS v4
- **Database & Auth:** Supabase (Postgres + Supabase Auth; no Prisma/ORM — queries go through `@supabase/supabase-js` directly)
- **Payments:** PayChangu (Standard Checkout) — webhook-verified, HMAC-SHA256 signed
- **Email:** Resend
- **SMS:** Africa's Talking
- **Hosting:** Vercel

> Note: `AGENTS.md` at the repo root warns this is a customized Next.js setup with breaking changes from a typical install — check `node_modules/next/dist/docs/` before relying on unfamiliar App Router APIs.

---

## Getting Started

### Prerequisites
```bash
Node.js 18+
npm
```

### Installation
```bash
npm install
cp .env.example .env.local   # fill in real values — see below
npm run dev
```
Open http://localhost:3000.

### Environment Variables
See `.env.example` for the full annotated list. Required for local dev:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`
- `RESEND_API_KEY`, `ADMIN_NOTIFICATION_EMAIL`
- `AFRICASTALKING_USERNAME`, `AFRICASTALKING_API_KEY`
- `PAYCHANGU_SECRET_KEY`, `PAYCHANGU_WEBHOOK_SECRET` (never prefix Paychangu keys with `NEXT_PUBLIC_` — server-only)

`SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. It's only ever imported by server-side modules (`lib/supabaseAdmin.ts` and `route.ts` handlers) — never import it into a `"use client"` component.

---

## Project Structure

```
app/
├── page.tsx                 # Public homepage / booking entry point
├── admin/                   # Admin portal (staff/super_admin/university ops roles)
│   ├── page.tsx              # Main bookings dashboard
│   ├── reports/              # Trip manifests, passenger reports
│   └── (sub)/                # Ambassadors, applications, business-configuration, commission-rates, communication, referral-bookings
├── ambassador/               # Referral ambassador portal
│   └── (protected)/          # Dashboard, commissions, customers, communication, profile
├── customer/                 # Customer self-service portal
│   ├── dashboard/ profile/ messages/ register/ login/ settings/ verify-email/
├── communication/            # Shared support-ticket/messaging UI
├── api/                      # Route handlers — see below
└── components/                # Shared UI (app/components/ui/*) + homepage sections

lib/
├── auth.ts                   # Browser Supabase client + authFetch (session-token-attaching fetch wrapper)
├── adminAuth.ts, staffLogin.ts, universityAdminAuth.ts   # Admin/staff auth & role helpers
├── customerAuth*.ts          # Customer auth (OTP, registration, session)
├── supabaseAdmin.ts          # Service-role Supabase client — SERVER ONLY
├── supabaseServer.ts         # Server-side session/role resolution
├── bookingLifecycle.ts, bookingPaymentStatus.ts, bookingValidation.ts, bookingTypes.ts
├── bookingServerUtils.ts / bookingClientUtils.ts   # Thin server/client re-export shims over bookingUtils.ts
├── payments/                 # PayChangu integration, webhook verification, reference generation
├── commissionLifecycle.ts, ambassadorCode.ts, referralStorage.ts, selfReferral.ts
├── rateLimit.ts              # Postgres-RPC-backed rate limiting (fails open on error, by design)
└── apiResponse.ts            # Shared jsonError() helper for API routes

proxy.ts                      # Next 16 middleware — route whitelisting, rate limiting, role-based route bucketing (defense-in-depth layer #1)
```

`app/api/` route groups: `admin`, `ambassadors`, `announcements`, `applications`, `auth`, `bookings`, `commission-rules`, `commissions`, `communication(s)`, `contact`, `customers`, `district-pickup-points`, `payments`, `profile`, `referrals`, `reports`, `resend`, `routes`, `settings`, `support-tickets`, `track-booking`, `universities`.

---

## Auth Model

There are **three separate user types**, all backed by Supabase Auth:
1. **Admin/staff** — roles include `admin`, `super_admin`, and scoped university-operations roles. Resolved via `resolveAdminRole` in `lib/supabaseServer.ts`.
2. **Ambassador** — referral partners, separate login at `app/ambassador/login`.
3. **Customer** — self-service accounts with OTP-based email verification.

Authorization is **layered**, not single-gated:
- `proxy.ts` (middleware) whitelists public routes, applies rate limiting to sensitive endpoints, and buckets API routes by required role.
- Each `route.ts` handler independently re-checks auth (`requireAdminUser`, `requireUniversityOperationsUser`, etc.) — never assume the middleware alone is sufficient when adding a new route; call the appropriate `require*` helper inside the handler too.

Client-side, `authFetch` (in `lib/auth.ts`) attaches the current Supabase session token to API calls and retries once on a 401 after a session refresh. **Import this shared helper rather than re-implementing it** — earlier duplicate copies existed in three admin pages and have been consolidated.

---

## Payments

`app/api/payments/webhook/route.ts` verifies the PayChangu webhook signature (HMAC-SHA256, `timingSafeEqual`, over the raw body) before parsing JSON, and uses idempotency-keyed event claiming to avoid double-processing. `lib/payments/verification-validator.ts` treats only the local DB record as authoritative for amount/booking ID — never trust amounts from the client or blindly from the provider payload. Booking fare is always re-verified server-side (`app/api/bookings/route.ts`), and a Postgres advisory-lock RPC (`claim_booking_dedupe`) prevents duplicate booking submissions.

---

## Development Tasks

### Run tests
```bash
npm test        # runs 13 files via `node --test` — pure business-logic unit tests only
npm run typecheck
npm run lint
```
There is currently no integration/route-handler test coverage (no jest/vitest/supertest configured) — auth-check regressions in a `route.ts` handler won't be caught by `npm test`. If you're adding tests for a new route, this is a known gap worth closing rather than a pattern to follow.

### Add a new API route
Use `jsonError` from `lib/apiResponse.ts` for error responses rather than redefining it locally. Add the appropriate `require*` auth check from `lib/universityAdminAuth.ts` / `lib/adminAuth.ts` at the top of the handler, and update `proxy.ts`'s route bucketing if the route needs specific role gating at the middleware layer too.

### Repair scripts
```bash
npm run repair:ambassadors   # node scripts/repair_ambassadors_user_id.js
```

---

## Deployment

```bash
npm run build
npm start
# or: vercel deploy
```
Set all `.env.example` variables in the Vercel project settings — the app will throw on boot if `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing (see `lib/auth.ts`).

---

## Further Reading
- `AGENTS.md` — Next.js version-specific quirks to check before writing App Router code
- `docs/` — includes `ambassador-system-audit.md`, referenced in code comments (`AMB-###`) as the source of specific fixes already applied
- Official docs: [Next.js](https://nextjs.org/docs), [React](https://react.dev), [Supabase](https://supabase.com/docs), [Tailwind CSS](https://tailwindcss.com)
