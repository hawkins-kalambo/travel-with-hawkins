import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { getCustomerProfile, updateCustomerProfile } from "@/lib/customerAuth";
import { normalizeAppRole } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const response = NextResponse.next();
    const authResult = await requireAuthenticatedUser(req, response);

    if (authResult.error || !authResult.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const profile = await getCustomerProfile(authResult.user.id);

    if (!profile) {
      return NextResponse.json(
        { success: false, error: "Profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error("GET /api/customers/profile error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to get profile" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const response = NextResponse.next();
    const authResult = await requireAuthenticatedUser(req, response);

    if (authResult.error || !authResult.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();

    const result = await updateCustomerProfile(authResult.user.id, body);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to update profile" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: result.profile,
    });
  } catch (error) {
    console.error("PUT /api/customers/profile error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update profile" },
      { status: 500 }
    );
  }
}
