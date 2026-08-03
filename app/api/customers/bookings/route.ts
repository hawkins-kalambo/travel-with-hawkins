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

    // Every branch must filter to this customer's own bookings — using
    // supabaseAdmin (service role) bypasses RLS, so the ownership check
    // has to happen here. Previously the bookingId branch skipped it
    // entirely, letting any authenticated customer read any booking by
    // supplying another customer's booking ID.
    let query = supabaseAdmin
      .from("bookings")
      .select("*")
      .or(`customer_id.eq.${authResult.user.id},email.eq.${authResult.user.email}`);

    if (bookingId) {
      query = query.eq("booking_id", bookingId);
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
