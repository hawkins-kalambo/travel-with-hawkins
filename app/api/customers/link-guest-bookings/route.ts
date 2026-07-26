import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { linkGuestBookings } from "@/lib/customerAuth";

export async function POST(req: NextRequest) {
  try {
    const response = NextResponse.next();
    const authResult = await requireAuthenticatedUser(req, response);

    if (authResult.error || !authResult.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const result = await linkGuestBookings(authResult.user.id, authResult.user.email || "");

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to link guest bookings" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      linkedCount: result.linkedCount,
      message: result.linkedCount && result.linkedCount > 0 
        ? `Successfully linked ${result.linkedCount} previous booking(s)` 
        : "No previous guest bookings found",
    });
  } catch (error) {
    console.error("POST /api/customers/link-guest-bookings error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to link guest bookings" },
      { status: 500 }
    );
  }
}
