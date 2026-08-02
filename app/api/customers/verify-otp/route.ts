import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyOtp } from "@/lib/customerOtp";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, code } = body;

    if (!email || !code) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: email, code" },
        { status: 400 }
      );
    }

    const result = await verifyOtp(email, code);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Verification failed" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    console.error("POST /api/customers/verify-otp error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Verification failed" },
      { status: 500 }
    );
  }
}
