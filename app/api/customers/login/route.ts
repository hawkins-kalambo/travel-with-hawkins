import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { loginCustomer } from "@/lib/customerAuthAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { email, password } = body;

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: email, password" },
        { status: 400 }
      );
    }

    // No brute-force protection previously existed on this endpoint at all.
    // Two buckets: per-account (stops a script targeting one victim's
    // password) and per-IP (stops one attacker spraying many accounts).
    const ip = getClientIp(req);
    const normalizedEmail = String(email).trim().toLowerCase();
    const [accountLimited, ipLimited] = await Promise.all([
      isRateLimited(`login:account:${normalizedEmail}`, 300, 5),
      isRateLimited(`login:ip:${ip}`, 300, 20),
    ]);

    if (accountLimited || ipLimited) {
      return NextResponse.json(
        { success: false, error: "Too many login attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    // Bind Supabase to request/response cookies so a successful sign-in
    // writes the session cookie the browser client and middleware rely on.
    // Signing in with a client that doesn't persist to cookies (e.g. the
    // plain server-side client from lib/auth.ts) leaves the browser with
    // no session even though the sign-in itself succeeded.
    const cookieResponse = NextResponse.next();
    const supabaseClient = createSupabaseServerClient(req, cookieResponse);

    const result = await loginCustomer(
      {
        email,
        password,
      },
      supabaseClient
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Login failed", code: result.code },
        { status: 401 }
      );
    }

    const finalResponse = NextResponse.json({
      success: true,
      userId: result.userId,
      message: "Login successful",
    });

    cookieResponse.cookies.getAll().forEach((cookie) => {
      finalResponse.cookies.set(cookie);
    });

    return finalResponse;
  } catch (error) {
    console.error("POST /api/customers/login error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Login failed" },
      { status: 500 }
    );
  }
}
