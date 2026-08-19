import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { canAccessAdminRoute, requireAuthenticatedUser, resolveAdminRole } from "@/lib/supabaseServer";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";

async function getUserRole(user: { id: string; user_metadata?: Record<string, unknown> } | null) {
  if (!user) return null;
  return resolveAdminRole(user);
}

// Vercel's own domain settings redirect the apex domain to www (a 308 that
// browsers follow but that server-to-server callers like PayChangu's
// webhook do not) — this must point at whichever host actually serves
// without a further redirect, or a *.vercel.app visitor gets bounced twice.
const CANONICAL_HOST = "www.travelwithhawkins.com";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const ip = getClientIp(request);
  const rateLimitKey = `${method}:${pathname}:${ip}`;

  // Keep the *.vercel.app deployment URL out of users' hands — everything
  // should be reached via the custom domain. API routes are excluded so
  // server-to-server callers (e.g. the PayChangu webhook, if ever pointed
  // at the vercel.app URL) aren't silently broken by a redirect they may
  // not follow.
  const hostname = request.nextUrl.hostname;
  if (hostname.endsWith(".vercel.app") && !pathname.startsWith("/api/")) {
    const canonicalUrl = new URL(pathname + request.nextUrl.search, `https://${CANONICAL_HOST}`);
    return NextResponse.redirect(canonicalUrl, 308);
  }

  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAmbassadorRoute = pathname === "/ambassador" || pathname.startsWith("/ambassador/");
  const isCustomerRoute = pathname === "/customer" || pathname.startsWith("/customer/");
  const isUiRoute = isAdminRoute || isAmbassadorRoute || isCustomerRoute;
  const isAdminLoginRoute = pathname === "/admin/login";
  const isResetRoute = pathname === "/reset-password" || pathname === "/update-password";
  const isAuthCallbackRoute = pathname.startsWith("/auth/");
  const isAmbassadorPublicRoute =
    pathname === "/ambassador/login" ||
    pathname === "/ambassador/apply" ||
    pathname === "/ambassador/forgot-password" ||
    pathname === "/ambassador/settings/security";
  const isCustomerPublicRoute =
    pathname === "/customer/login" ||
    pathname === "/customer/register" ||
    pathname === "/customer/forgot-password" ||
    // A freshly-registered customer has no session yet (registerCustomer
    // uses supabaseAdmin.auth.admin.createUser(), which never creates a
    // browser session) — the public API carve-out below already accounts
    // for this for verify-otp/resend-otp, but the *page* itself was missing
    // from this list, so the proxy bounced them to /customer/login before
    // they ever saw the code-entry screen.
    pathname === "/customer/verify-email";
  const isPublicEntryRoute = isAdminLoginRoute || isAmbassadorPublicRoute || isCustomerPublicRoute || isResetRoute || isAuthCallbackRoute;

  // Reading settings (routes/fares/booking fee) is public — the homepage
  // needs it for anonymous visitors. Editing (PATCH/PUT) stays admin-only,
  // both here and via requireAdminUser inside the route handler itself.
  const isPublicSettingsRead = pathname === "/api/settings" && method === "GET";
  const isSettingsRoute = pathname.startsWith("/api/settings") && !isPublicSettingsRead;
  const isBookingsRoute = pathname.startsWith("/api/bookings");
  const isCustomerApiRoute = pathname.startsWith("/api/customers");
  // Payment initialization is guest-accessible (authorization is the
  // booking-ID + contact-match check inside the route handler, same model
  // as /api/track-booking) — never gated behind a Supabase session here.
  // The webhook is PayChangu calling us directly with no Supabase session
  // at all; it authenticates via HMAC signature verification inside the
  // route, not middleware auth. Both are rate-limited in their own handlers.
  // Everything else under /api/payments/ (confirm, send-receipt, and any
  // future admin/reporting endpoints) stays admin-only.
  const isPublicPaymentInitialize = pathname.startsWith("/api/payments/") && pathname.endsWith("/initialize") && method === "POST";
  // GET is PayChangu's hosted checkout redirecting the customer's own
  // browser here after payment (confirmed live: Referer checkout.paychangu.com,
  // ?tx_ref=... in the query string) -- distinct from the signed
  // server-to-server POST this route also handles. The route itself just
  // forwards a GET straight to /payment/return, so it's exactly as safe to
  // leave ungated as that page already is.
  const isPublicPaymentWebhook = pathname === "/api/payments/webhook" && (method === "POST" || method === "GET");
  // Status checks are rate-limited and gated by possession of a
  // server-generated tx_ref (see app/api/payments/status/route.ts), not by
  // a Supabase session — the browser return page has no session context.
  const isPublicPaymentStatus = pathname === "/api/payments/status" && method === "POST";
  // Same guest bookingId + contact-match model as track-booking/initialize,
  // not a Supabase session — this was previously swept into the
  // admin-payments bucket below by accident and forced a 401 on real guest
  // cash-payment selections.
  const isPublicPaymentSelectCash = pathname === "/api/payments/fare/select-cash" && method === "POST";
  const isAdminPaymentsRoute =
    pathname.startsWith("/api/payments") &&
    !isPublicPaymentInitialize &&
    !isPublicPaymentWebhook &&
    !isPublicPaymentStatus &&
    !isPublicPaymentSelectCash;
  // Application submission is guest-accessible — a prospective ambassador
  // has no Supabase session yet. GET (admin listing) stays gated; the route
  // handler itself already enforces requireAdminUser for GET and has no
  // auth check for POST, so this mirrors isPublicBookingCreate below.
  const isPublicApplicationCreate = pathname === "/api/applications" && method === "POST";
  // Referral-code validation is guest-accessible — the booking form checks
  // a code before the visitor has any session at all. It has no auth check
  // of its own (by design, like isPublicApplicationCreate) and is
  // rate-limited in the route handler itself.
  const isPublicReferralValidate = pathname === "/api/referrals/validate" && method === "POST";
  const isAdminApiRoute =
    isSettingsRoute ||
    pathname.startsWith("/api/reports") ||
    (pathname.startsWith("/api/referrals") && !isPublicReferralValidate) ||
    (pathname.startsWith("/api/applications") && !isPublicApplicationCreate) ||
    pathname.startsWith("/api/ambassadors") ||
    pathname.startsWith("/api/communications") ||
    pathname.startsWith("/api/communication") ||
    isAdminPaymentsRoute ||
    pathname.startsWith("/api/commissions") ||
    pathname.startsWith("/api/commission-rules") ||
    pathname.startsWith("/api/admin/") ||
    // Previously missing entirely from the protected-route list — GET/POST
    // are self-service (a caller lists/creates their own tickets) so they
    // still just need "logged in", enforced same as everywhere else in this
    // bucket; PATCH is admin-only, enforced below by isAlwaysAdminOnlyApiRoute.
    pathname.startsWith("/api/support-tickets") ||
    // Every method here is admin-only (see isAlwaysAdminOnlyApiRoute below).
    pathname.startsWith("/api/announcements");

  const isPublicBookingCreate = isBookingsRoute && method === "POST";
  // Guest/customer booking lookups go through POST /api/track-booking (its
  // own route, rate-limited and contact-verified there) — GET /api/bookings
  // (list-all or lookup-by-id) is always admin-only now. The urgency-signal
  // sub-route is deliberately public: it returns only a destination string,
  // never raw booking rows.
  const isPublicUrgencySignal = pathname === "/api/bookings/urgency" && method === "GET";
  // verify-otp and resend-otp must be public too: a freshly-registered
  // customer (registerCustomer uses supabaseAdmin.auth.admin.createUser,
  // which never creates a browser session) has no session yet when they
  // need to verify their email. Both routes already rate-limit/cap
  // attempts internally (lib/customerOtp.ts).
  const isPublicCustomerRoute =
    isCustomerApiRoute &&
    (pathname === "/api/customers/register" ||
      pathname === "/api/customers/login" ||
      pathname === "/api/customers/forgot-password" ||
      pathname === "/api/customers/verify-otp" ||
      pathname === "/api/customers/resend-otp");
  const isAdminBookingRoute = isBookingsRoute && !isPublicBookingCreate && !isPublicUrgencySignal;

  const isProtectedApiRoute =
    isSettingsRoute ||
    isAdminApiRoute ||
    isAdminBookingRoute ||
    (isCustomerApiRoute && !isPublicCustomerRoute);

  if (pathname.startsWith("/api/bookings") && method === "POST") {
    if (await isRateLimited(rateLimitKey)) {
      return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
    }
  }

  // Fixes AMB-008 from docs/ambassador-system-audit.md — the public
  // ambassador application endpoint had no rate limiting at all.
  if (pathname === "/api/applications" && method === "POST") {
    if (await isRateLimited(rateLimitKey)) {
      return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
    }
  }

  if (isProtectedApiRoute) {
    if (await isRateLimited(rateLimitKey)) {
      return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
    }
  }

  if (!isProtectedApiRoute && !isUiRoute) {
    return NextResponse.next();
  }

  if (isPublicEntryRoute) {
    return NextResponse.next();
  }

  const authResponse = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(request, authResponse);

  // A one-time signal on a specific link (currently: the chat-handoff alert
  // email) that demands a fresh password entry before proceeding, even from
  // a device that's already signed in -- since the link travels through
  // email/SMS, an already-unlocked phone in someone else's hands shouldn't
  // get straight in on an existing session. Stripped by the login page once
  // satisfied (see sanitizeNextPath there), so it only fires for that one
  // click, not every subsequent visit to the destination.
  const forceLogin = request.nextUrl.searchParams.get("forceLogin") === "1";

  if (forceLogin || error || !user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    let redirectTarget = "/admin/login";
    if (isCustomerRoute) {
      redirectTarget = "/customer/login";
    } else if (isAmbassadorRoute) {
      redirectTarget = "/ambassador/login";
    }

    const redirectUrl = new URL(redirectTarget, request.url);
    // Preserve the query string, not just the path -- a deep link like
    // /admin/communication?tab=website&conversation=<id> (the chat-handoff
    // alert email's link) would otherwise lose exactly the part that makes
    // it a deep link once bounced through login.
    redirectUrl.searchParams.set("redirectedFrom", pathname + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  const role = await getUserRole(user);

  // Defense-in-depth: these API buckets are unconditionally admin-only —
  // every handler in them already calls requireAdminUser or checks a
  // manage* permission (never granted to viewer/ambassador/customer), so
  // gating here too costs nothing and means a handler that ever drops its
  // own check isn't a full privilege-escalation hole on its own. Left out
  // on purpose: /api/referrals (validate carve-out aside), /api/communication(s)
  // — those mix admin and self-service access and already scope correctly
  // inside each handler; a blanket gate here would incorrectly lock
  // ambassadors/customers out of their own data.
  // GET /api/applications is dual-purpose: admins list everything, but the
  // handler also lets a non-admin caller see their own application by
  // email — forcing this into the admin-only bucket 403'd every applicant
  // and ambassador checking their own status. /api/applications/review and
  // any other method on /api/applications stay admin-only.
  const isSelfServiceApplicationsGet = pathname === "/api/applications" && method === "GET";
  // /api/ambassadors/me is the one self-service sub-route under
  // /api/ambassadors — everything else there (list, [id], password, resend)
  // is admin-only.
  const isAmbassadorSelfService = pathname === "/api/ambassadors/me";
  // GET/POST /api/support-tickets are self-service (a caller lists/creates
  // their own tickets); only PATCH (status/assignee changes) is admin-only.
  const isAdminOnlySupportTicketAction = pathname === "/api/support-tickets" && method === "PATCH";
  // Proxy is only an optimistic gate. These routes perform definitive
  // university assignment and row-scope checks inside their handlers.
  const isUniversityOperationsApiRoute =
    pathname === "/api/admin/bookings" ||
    pathname === "/api/bookings" ||
    pathname.startsWith("/api/reports") ||
    pathname === "/api/payments/fare/confirm-cash" ||
    pathname === "/api/payments/fare/record-manual" ||
    pathname === "/api/payments/receipt" ||
    pathname === "/api/payments/send-receipt" ||
    (method === "GET" && pathname.startsWith("/api/ambassadors")) ||
    (method === "GET" && pathname === "/api/commissions") ||
    pathname.startsWith("/api/district-pickup-points");
  const isAlwaysAdminOnlyApiRoute =
    isSettingsRoute ||
    isAdminPaymentsRoute ||
    isAdminBookingRoute ||
    pathname.startsWith("/api/reports") ||
    pathname.startsWith("/api/commission-rules") ||
    pathname.startsWith("/api/admin/") ||
    pathname.startsWith("/api/commissions") ||
    (pathname.startsWith("/api/ambassadors") && !isAmbassadorSelfService) ||
    pathname.startsWith("/api/announcements") ||
    isAdminOnlySupportTicketAction ||
    (pathname.startsWith("/api/applications") && !isPublicApplicationCreate && !isSelfServiceApplicationsGet);

  const hasScopedOperationsProxyAccess =
    isUniversityOperationsApiRoute &&
    (role === "university_admin" || (role === "viewer" && method === "GET"));

  if (isAlwaysAdminOnlyApiRoute && role !== "super_admin" && role !== "admin" && !hasScopedOperationsProxyAccess) {
    return NextResponse.json({ success: false, error: "Admin access required" }, { status: 403 });
  }

  if (isAdminRoute) {
    const isAllowed = canAccessAdminRoute(role, pathname);
    if (!isAllowed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ success: false, error: "Access denied" }, { status: 403 });
      }
      const deniedUrl = new URL("/admin", request.url);
      deniedUrl.searchParams.set("accessDenied", "1");
      return NextResponse.redirect(deniedUrl);
    }
  }

  if (isAmbassadorRoute) {
    const isAmbassador = role === "ambassador";
    if (!isAmbassador) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ success: false, error: "Ambassador access required" }, { status: 403 });
      }
      return authResponse;
    }
  }

  if (isCustomerRoute) {
    const isCustomer = role === "customer" || role === "unknown"; // Allow 'unknown' for newly registered customers
    if (!isCustomer && role !== "super_admin" && role !== "admin") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ success: false, error: "Customer access required" }, { status: 403 });
      }
      // Redirect admin/ambassador to their respective dashboards
      const redirectTarget = role === "ambassador" ? "/ambassador" : "/admin";
      return NextResponse.redirect(new URL(redirectTarget, request.url));
    }
  }

  return authResponse;
}

export const config = {
  // Broadened from the previous auth-only route list so the vercel.app
  // host check above runs on every page, not just protected ones.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)"],
};
