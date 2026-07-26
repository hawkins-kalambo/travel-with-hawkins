import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { resetPassword, changePassword } from "@/lib/customerAuth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { newPassword, confirmPassword, currentPassword, mode } = body;

    if (!mode || !["reset", "change"].includes(mode)) {
      return NextResponse.json(
        { success: false, error: "Invalid mode. Must be 'reset' or 'change'" },
        { status: 400 }
      );
    }

    if (!newPassword || !confirmPassword) {
      return NextResponse.json(
        { success: false, error: "newPassword and confirmPassword are required" },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: "Passwords do not match" },
        { status: 400 }
      );
    }

    if (mode === "reset") {
      const result = await resetPassword(newPassword);
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || "Failed to reset password" },
          { status: 400 }
        );
      }
      return NextResponse.json({
        success: true,
        message: "Password reset successful",
      });
    } else if (mode === "change") {
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, error: "currentPassword is required for change mode" },
          { status: 400 }
        );
      }

      const response = NextResponse.next();
      const authResult = await requireAuthenticatedUser(req, response);

      if (authResult.error || !authResult.user) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 }
        );
      }

      const result = await changePassword(currentPassword, newPassword);
      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error || "Failed to change password" },
          { status: 400 }
        );
      }
      return NextResponse.json({
        success: true,
        message: "Password changed successfully",
      });
    }
  } catch (error) {
    console.error("POST /api/customers/password error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Password operation failed" },
      { status: 500 }
    );
  }
}
