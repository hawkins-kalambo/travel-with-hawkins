import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { registerOperator } from "@/lib/operatorRegistration";

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
      message: "Application submitted. Check your email to confirm your address, then sign in to track your application status.",
    });
  } catch (error) {
    console.error("POST /api/operators/register error", error);
    return jsonError(error instanceof Error ? error.message : "Registration failed");
  }
}
