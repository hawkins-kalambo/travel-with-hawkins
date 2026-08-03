import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";

// Admin and ambassador login (app/admin/login, app/ambassador/login) call
// supabase.auth.signInWithPassword directly from the browser so the session
// cookie is written correctly by the Supabase browser client — that means
// there's no backend request our own middleware/rate limiter ever sees, and
// so no brute-force protection on those two logins at all. This endpoint
// gives the login pages something to check *before* attempting sign-in,
// backed by the same shared rate-limit bucket as everything else
// (lib/rateLimit.ts). It never touches credentials, only counts attempts.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email) {
      return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
    }

    const ip = getClientIp(req);
    const [accountLimited, ipLimited] = await Promise.all([
      isRateLimited(`login:account:${email}`, 300, 5),
      isRateLimited(`login:ip:${ip}`, 300, 20),
    ]);

    if (accountLimited || ipLimited) {
      return NextResponse.json(
        { success: false, error: "Too many login attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/auth/login-attempt error", error);
    // Fail open, matching lib/rateLimit.ts's own failure mode — a rate
    // limiter outage must never block every legitimate login attempt.
    return NextResponse.json({ success: true });
  }
}
