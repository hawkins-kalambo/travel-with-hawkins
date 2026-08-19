import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { registerOperator } from "@/lib/operatorRegistration";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const {
      legalName,
      displayName,
      isIndividual,
      ownerFullName,
      ownerEmail,
      ownerPhone,
      ownerPassword,
      ownerConfirmPassword,
    } = body as Record<string, unknown>;

    if (
      typeof legalName !== "string" ||
      typeof displayName !== "string" ||
      typeof ownerFullName !== "string" ||
      typeof ownerEmail !== "string" ||
      typeof ownerPhone !== "string" ||
      typeof ownerPassword !== "string" ||
      typeof ownerConfirmPassword !== "string"
    ) {
      return jsonError("Missing required fields", 400);
    }

    // Same gap as app/api/customers/register/route.ts had, same fix: nothing
    // throttled repeated operator-application submissions, each of which
    // creates a real Supabase Auth user via lib/operatorRegistration.ts.
    const ip = getClientIp(req);
    const normalizedEmail = ownerEmail.trim().toLowerCase();
    const [accountLimited, ipLimited] = await Promise.all([
      isRateLimited(`register:account:${normalizedEmail}`, 300, 5),
      isRateLimited(`register:ip:${ip}`, 300, 20),
    ]);
    if (accountLimited || ipLimited) {
      return jsonError("Too many registration attempts. Please wait a few minutes and try again.", 429);
    }

    const result = await registerOperator({
      legalName,
      displayName,
      isIndividual: isIndividual === true,
      ownerFullName,
      ownerEmail,
      ownerPhone,
      ownerPassword,
      ownerConfirmPassword,
    });

    if (!result.success) {
      return jsonError(result.error, 400);
    }

    return NextResponse.json({
      success: true,
      operatorId: result.operatorId,
      message: "Application submitted. You can sign in right away to track your application status.",
    });
  } catch (error) {
    console.error("POST /api/operators/register error", error);
    return jsonError(error instanceof Error ? error.message : "Registration failed");
  }
}
