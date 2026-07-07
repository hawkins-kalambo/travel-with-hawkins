import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { isRateLimited } from "@/lib/rateLimit";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const ip = request.headers.get("x-forwarded-for") || "local";
  const rateLimitKey = `${method}:${pathname}:${ip}`;

  const isSettingsRoute = pathname.startsWith("/api/settings");
  const isBookingsRoute = pathname.startsWith("/api/bookings");

  const isPublicBookingCreate = isBookingsRoute && method === "POST";
  const isPublicBookingLookup =
    isBookingsRoute &&
    method === "GET" &&
    request.nextUrl.searchParams.has("trackingId");

  const isProtected =
    isSettingsRoute ||
    (isBookingsRoute && !isPublicBookingLookup && !isPublicBookingCreate);

  if (pathname.startsWith("/api/bookings") && method === "POST") {
    if (isRateLimited(rateLimitKey)) {
      return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
    }
  }

  if (isProtected) {
    if (isRateLimited(rateLimitKey)) {
      return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
    }
  }

  // ✅ PUBLIC ROUTES
  if (!isProtected) {
    return NextResponse.next();
  }

  // ❗ IMPORTANT FIX: NEVER continue without auth check result
  const authResponse = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(
    request,
    authResponse
  );

  if (error || !user) {
    // 🔥 CRITICAL FIX: API must NEVER redirect (only JSON)
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    // UI routes can redirect
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return authResponse;
}

export const config = {
  matcher: ["/api/:path*"],
};