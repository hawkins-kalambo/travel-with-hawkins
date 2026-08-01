import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeBookingRecord } from "@/lib/bookingServerUtils";
import { logError } from "@/lib/logger";

// Staff-only counterpart to a guest choosing "pay fare in cash on boarding
// day" (see lib/payments/payment-service.ts selectCashFarePayment). This is
// the step that actually settles the fare once the cash has physically
// changed hands — nothing here touches the `payments` table or PayChangu,
// it's purely the booking's fare_status/fare_payment_method fields, mirroring
// how app/api/payments/confirm/route.ts settles the legacy payment_status
// field for manual/cash confirmations.
function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function getBookingId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const { authorized, user, error } = await requireAdminUser(request, response);

  if (!authorized || !user) {
    return jsonError(error || "Unauthorized", 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const bookingId = getBookingId((body as Record<string, unknown>).bookingId);

    if (!bookingId) {
      return jsonError("bookingId is required", 400);
    }

    const { data, error: fetchError } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (fetchError) {
      logError("Failed to load booking for cash fare confirmation", { error: fetchError.message, bookingId });
      return jsonError("Unable to load booking", 500);
    }

    if (!data) {
      return jsonError("Booking not found", 404);
    }

    const booking = normalizeBookingRecord(data as Record<string, unknown>);

    if (booking.fareStatus === "paid" || booking.fareStatus === "cash_collected") {
      return NextResponse.json({ success: true, booking, message: "Already settled" });
    }

    const { data: updatedBooking, error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({
        fare_status: "cash_collected",
        fare_payment_method: "cash",
        fare_cash_collected_by: user.id,
        fare_cash_collected_at: new Date().toISOString(),
      })
      .eq("booking_id", bookingId)
      .select()
      .single();

    if (updateError) {
      logError("Failed to record cash fare collection", { error: updateError.message, bookingId });
      return jsonError("Unable to record cash collection", 500);
    }

    return NextResponse.json({
      success: true,
      booking: normalizeBookingRecord(updatedBooking as Record<string, unknown>),
    });
  } catch (error) {
    logError("Confirm cash fare route failed", { error });
    return jsonError(error instanceof Error ? error.message : "Unknown error", 500);
  }
}
