import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { canAccessAdminRoute, requireAuthenticatedUser, resolveAdminRole } from "@/lib/supabaseServer";
import { isRateLimited } from "@/lib/rateLimit";

async function getUserRole(user: { id: string; user_metadata?: Record<string, unknown> } | null) {
  if (!user) return null;
  return resolveAdminRole(user);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const ip = request.headers.get("x-forwarded-for") || "local";
  const rateLimitKey = `${method}:${pathname}:${ip}`;

  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAmbassadorRoute = pathname === "/ambassador" || pathname.startsWith("/ambassador/");
  const isUiRoute = isAdminRoute || isAmbassadorRoute;
  const isAdminLoginRoute = pathname === "/admin/login";
  const isResetRoute = pathname === "/reset-password" || pathname === "/update-password";
  const isAuthCallbackRoute = pathname.startsWith("/auth/");
  const isAmbassadorPublicRoute =
    pathname === "/ambassador/login" ||
    pathname === "/ambassador/apply" ||
    pathname === "/ambassador/forgot-password" ||
    pathname === "/ambassador/settings/security";
  const isPublicEntryRoute = isAdminLoginRoute || isAmbassadorPublicRoute || isResetRoute || isAuthCallbackRoute;

  const isSettingsRoute = pathname.startsWith("/api/settings");
  const isBookingsRoute = pathname.startsWith("/api/bookings");
  const isAdminApiRoute =
    pathname.startsWith("/api/settings") ||
    pathname.startsWith("/api/reports") ||
    pathname.startsWith("/api/referrals") ||
    pathname.startsWith("/api/applications") ||
    pathname.startsWith("/api/ambassadors") ||
    pathname.startsWith("/api/communications") ||
    pathname.startsWith("/api/communication") ||
    pathname.startsWith("/api/payments") ||
    pathname.startsWith("/api/commissions") ||
    pathname.startsWith("/api/commission-rules") ||
    pathname.startsWith("/api/admin/");

  const isPublicBookingCreate = isBookingsRoute && method === "POST";
  const isPublicBookingLookup =
    isBookingsRoute &&
    method === "GET" &&
    request.nextUrl.searchParams.has("trackingId");
  const isAdminBookingRoute = isBookingsRoute && !isPublicBookingLookup && !isPublicBookingCreate;

  const isProtectedApiRoute =
    isSettingsRoute ||
    isAdminApiRoute ||
    isAdminBookingRoute;

  if (pathname.startsWith("/api/bookings") && method === "POST") {
    if (isRateLimited(rateLimitKey)) {
      return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
    }
  }

  if (isProtectedApiRoute) {
    if (isRateLimited(rateLimitKey)) {
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

    const redirectTarget = isAdminRoute ? "/admin/login" : "/ambassador/login";
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

  return authResponse;
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*", "/ambassador/:path*", "/reset-password", "/update-password", "/auth/:path*"],
};