import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { canAccessAdminRoute, requireAuthenticatedUser, resolveAdminRole } from "@/lib/supabaseServer";
import { isRateLimited } from "@/lib/rateLimit";

async function getUserRole(user: { id: string; user_metadata?: Record<string, unknown> } | null) {
  if (!user) return null;
  return resolveAdminRole(user);
}

const CANONICAL_HOST = "travelwithhawkins.com";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const ip = request.headers.get("x-forwarded-for") || "local";
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
    pathname === "/customer/forgot-password";
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
  const isPublicPaymentWebhook = pathname === "/api/payments/webhook" && method === "POST";
  // Status checks are rate-limited and gated by possession of a
  // server-generated tx_ref (see app/api/payments/status/route.ts), not by
  // a Supabase session — the browser return page has no session context.
  const isPublicPaymentStatus = pathname === "/api/payments/status" && method === "POST";
  const isAdminPaymentsRoute = pathname.startsWith("/api/payments") && !isPublicPaymentInitialize && !isPublicPaymentWebhook && !isPublicPaymentStatus;
  // Application submission is guest-accessible — a prospective ambassador
  // has no Supabase session yet. GET (admin listing) stays gated; the route
  // handler itself already enforces requireAdminUser for GET and has no
  // auth check for POST, so this mirrors isPublicBookingCreate below.
  const isPublicApplicationCreate = pathname === "/api/applications" && method === "POST";
  const isAdminApiRoute =
    isSettingsRoute ||
    pathname.startsWith("/api/reports") ||
    pathname.startsWith("/api/referrals") ||
    (pathname.startsWith("/api/applications") && !isPublicApplicationCreate) ||
    pathname.startsWith("/api/ambassadors") ||
    pathname.startsWith("/api/communications") ||
    pathname.startsWith("/api/communication") ||
    isAdminPaymentsRoute ||
    pathname.startsWith("/api/commissions") ||
    pathname.startsWith("/api/commission-rules") ||
    pathname.startsWith("/api/admin/");

  const isPublicBookingCreate = isBookingsRoute && method === "POST";
  // Guest/customer booking lookups go through POST /api/track-booking (its
  // own route, rate-limited and contact-verified there) — GET /api/bookings
  // (list-all or lookup-by-id) is always admin-only now. The urgency-signal
  // sub-route is deliberately public: it returns only a destination string,
  // never raw booking rows.
  const isPublicUrgencySignal = pathname === "/api/bookings/urgency" && method === "GET";
  const isPublicCustomerRoute = isCustomerApiRoute && (pathname === "/api/customers/register" || pathname === "/api/customers/login" || pathname === "/api/customers/forgot-password");
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

  if (error || !user) {
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
    redirectUrl.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const role = await getUserRole(user);

  if (isAdminRoute) {
    const isAllowed = canAccessAdminRoute(role, pathname);
    if (!isAllowed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ success: false, error: "Access denied" }, { status: 403 });
      }
      return authResponse;
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