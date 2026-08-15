import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, password } = body as Record<string, unknown>;

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return jsonError("Missing required fields: email, password", 400);
    }

    const ip = getClientIp(req);
    const normalizedEmail = email.trim().toLowerCase();
    const [accountLimited, ipLimited] = await Promise.all([
      isRateLimited(`login:operator:account:${normalizedEmail}`, 300, 5),
      isRateLimited(`login:operator:ip:${ip}`, 300, 20),
    ]);

    if (accountLimited || ipLimited) {
      return jsonError("Too many login attempts. Please wait a few minutes and try again.", 429);
    }

    const cookieResponse = NextResponse.next();
    const supabaseClient = createSupabaseServerClient(req, cookieResponse);

    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError || !authData.session || !authData.user) {
      return jsonError(authError?.message || "Login failed", 401);
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("operator_memberships")
      .select("operator_id, staff_role, status")
      .eq("user_id", authData.user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      await supabaseClient.auth.signOut();
      return jsonError("This account is not linked to an active operator", 403);
    }

    const finalResponse = NextResponse.json({
      success: true,
      operatorId: membership.operator_id,
      staffRole: membership.staff_role,
      message: "Login successful",
    });

    cookieResponse.cookies.getAll().forEach((cookie) => {
      finalResponse.cookies.set(cookie);
    });

    return finalResponse;
  } catch (error) {
    console.error("POST /api/operators/login error", error);
    return jsonError(error instanceof Error ? error.message : "Login failed");
  }
}
