import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeBookingRecord } from "@/lib/bookingUtils";

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

    const url = new URL(req.url);
    const bookingId = url.searchParams.get("bookingId");

    // Build query - get bookings for this customer
    let query = supabaseAdmin
      .from("bookings")
      .select("*");

    // If specific booking ID requested, filter by it
    if (bookingId) {
      query = query.eq("booking_id", bookingId);
    } else {
      // Otherwise get all bookings for this customer
      // First try to get by customer_id, then by email for guest bookings
      query = query.or(`customer_id.eq.${authResult.user.id},email.eq.${authResult.user.email}`);
    }

    query = query.order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("Query error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const bookings = (data ?? []).map((row) =>
      normalizeBookingRecord(row as Record<string, unknown>)
    );

    return NextResponse.json({
      success: true,
      bookings,
      booking: bookingId && bookings.length > 0 ? bookings[0] : null,
    });
  } catch (error) {
    console.error("GET /api/customers/bookings error", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch bookings" },
      { status: 500 }
    );
  }
}
