# Auth Migration + Lint Fix Tracker

## Status
- [ ] Replace legacy auth in `app/login/page.tsx` (Supabase signInWithPassword)
- [ ] Replace legacy auth gating in `app/admin/page.tsx` (Supabase getSession + signOut)
- [ ] Create `middleware.ts` protecting `/admin/*`
- [ ] Admin verification against `public.admins`

## Current ESLint blockers (must fix)
- [ ] app/admin/page.tsx: no-explicit-any (list parsing)
- [ ] app/api/send-booking-email/route.ts: no-explicit-any (catch)
- [ ] app/page.tsx: no-explicit-any (JSON parsing for bookings urgency)
- [ ] app/page.tsx: react/no-unescaped-entities (' in JSX string)
- [ ] emails/BookingConfirmation.tsx: react-hooks/set-state-in-effect

After ESLint passes:
- [ ] Re-run `npm run lint` and `npm run build`.

