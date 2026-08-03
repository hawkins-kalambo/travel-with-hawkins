import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requestPasswordReset } from "@/lib/customerAuth";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";

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

    // Public by design (a locked-out customer has no session), and the
    // response is generic either way so there's no enumeration signal —
    // but nothing previously stopped repeatedly triggering Supabase's
    // reset email at unlimited rate. Matches the same bucket shape used
    // for other public write endpoints (e.g. /api/applications POST).
    if (await isRateLimited(`forgot-password:${getClientIp(req)}`)) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Please wait a moment and try again." },
        { status: 429 }
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
