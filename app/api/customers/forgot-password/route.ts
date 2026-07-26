import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requestPasswordReset } from "@/lib/customerAuth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }

    const result = await requestPasswordReset(email);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to send reset email" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Password reset link sent to your email. Please check your inbox.",
    });
  } catch (error) {
    console.error("POST /api/customers/forgot-password error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to process request" },
      { status: 500 }
    );
  }
}
