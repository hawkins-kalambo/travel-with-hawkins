import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeBookingRecord } from "@/lib/bookingServerUtils";
import { logError } from "@/lib/logger";
import { requireUniversityOperationsUser } from "@/lib/universityAdminAuth";
import { jsonError } from "@/lib/apiResponse";

// Staff-only counterpart to a guest choosing "pay fare in cash on boarding
// day" (see lib/payments/payment-service.ts selectCashFarePayment). This is
// the step that actually settles the fare once the cash has physically
// changed hands — nothing here touches the `payments` table or PayChangu,
// it's purely the booking's fare_status/fare_payment_method fields, mirroring
// how app/api/payments/confirm/route.ts settles the legacy payment_status
// field for manual/cash confirmations.
function getBookingId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireUniversityOperationsUser(request, response, "confirmCash");

  if (!auth.authorized) {
    return jsonError(auth.error, auth.status);
  }
  const { user, role } = auth;

  try {
    const body = await request.json().catch(() => ({}));
    const bookingId = getBookingId((body as Record<string, unknown>).bookingId);

    if (!bookingId) {
      return jsonError("bookingId is required", 400);
    }

    let bookingQuery = supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("booking_id", bookingId);
    if (!auth.isGlobal) bookingQuery = bookingQuery.in("university_id", auth.universityIds);
    const { data, error: fetchError } = await bookingQuery.maybeSingle();

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
    if (booking.fareStatus !== "cash_selected") {
      return jsonError("Cash collection can only be recorded after the customer selects cash payment", 409);
    }

    let updateQuery = supabaseAdmin
      .from("bookings")
      .update({
        fare_status: "cash_collected",
        fare_payment_method: "cash",
        fare_cash_collected_by: user.id,
        fare_cash_collected_at: new Date().toISOString(),
      })
      .eq("booking_id", bookingId);
    if (!auth.isGlobal) updateQuery = updateQuery.in("university_id", auth.universityIds);
    const { data: updatedBooking, error: updateError } = await updateQuery.select().single();

    if (updateError) {
      logError("Failed to record cash fare collection", { error: updateError.message, bookingId });
      return jsonError("Unable to record cash collection", 500);
    }

    const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
      actor_user_id: user.id,
      actor_role: role,
      action: "collect_cash_fare",
      entity_type: "booking",
      entity_id: bookingId,
      previous_value: data,
      new_value: updatedBooking,
      ip_address: request.headers.get("x-real-ip"),
      user_agent: request.headers.get("user-agent"),
      metadata: { payment_method: "cash" },
      university_id: booking.universityId ?? null,
    });
    if (auditError) logError("Failed to audit cash fare collection", { error: auditError.message, bookingId });

    return NextResponse.json({
      success: true,
      booking: normalizeBookingRecord(updatedBooking as Record<string, unknown>),
    });
  } catch (error) {
    logError("Confirm cash fare route failed", { error });
    return jsonError(error instanceof Error ? error.message : "Unknown error", 500);
  }
}
