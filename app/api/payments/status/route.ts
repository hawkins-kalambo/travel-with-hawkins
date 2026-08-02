import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRateLimited } from "@/lib/rateLimit";
import { verifyAndFinalizePayment } from "@/lib/payments/finalize-flow";
import { loadBookingById } from "@/lib/bookingAccess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveRouteFareIfAvailable } from "@/lib/routePricing";

export const runtime = "nodejs";

// Public (rate-limited) status check for the browser return page. A tx_ref
// is a 128-bit server-generated random value (see lib/payments/reference.ts)
// known only to us, PayChangu, and whoever the browser was redirected back
// to with it in the URL — the same trust model most hosted-checkout
// providers use for a return-URL session identifier. Possessing it proves
// "this is the browser that just completed (or abandoned) this specific
// checkout", nothing more; it never grants access to any other payment or
// booking data, and the actual payment status still comes from an
// independent PayChangu verification, not from anything the caller claims.
function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  if (await isRateLimited(`payments:status:${ip}`)) {
    return jsonError("Too many requests. Please wait a moment and try again.", 429);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const txRef = typeof payload.txRef === "string" ? payload.txRef.trim() : "";
  if (!txRef) {
    return jsonError("txRef is required.", 400);
  }

  // Runs the same verify → validate → finalize path the webhook uses (see
  // lib/payments/finalize-flow.ts) — this call can itself complete the
  // payment if the webhook hasn't arrived yet, or safely no-op if it has.
  const result = await verifyAndFinalizePayment(txRef);

  if (result.outcome === "rejected") {
    if (result.reason === "unknown_tx_ref") {
      return jsonError("We couldn't find that payment.", 404);
    }
    return NextResponse.json({ success: true, status: "failed", reason: result.reason });
  }

  if (result.outcome === "pending") {
    return NextResponse.json({ success: true, status: "pending" });
  }

  // The caller already proved ownership of this checkout session by
  // possessing its tx_ref (see the trust-model note above), so it's safe to
  // hand back the receipt data for the booking that tx_ref just paid for —
  // this lets the return page render/download the receipt without requiring
  // the guest to be logged in.
  let receipt: Record<string, unknown> | null = null;
  const lookup = await loadBookingById(result.bookingId);
  if (lookup.found) {
    const booking = lookup.booking;
    const { data: settingsData } = await supabaseAdmin
      .from("settings")
      .select("routes, route_objects")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const resolvedRouteFare = resolveRouteFareIfAvailable(booking.destination, settingsData as Record<string, unknown> | undefined);

    // The legacy paymentStatus/receiptNumber/paymentConfirmedAt fields are
    // only ever written by the manual admin "Confirm Payment" flow (see
    // app/admin/page.tsx) — this automated PayChangu path never touches
    // them, so they can't be used here. Instead, describe exactly what this
    // tx_ref just paid for using the booking_fee_status/fare_status fields
    // finalize_payment actually updates, and fall back to the tx_ref itself
    // (already known to this caller) as the receipt number when no manual
    // receipt number has been assigned.
    const paidBookingFee = result.paymentType === "booking_fee";
    receipt = {
      bookingId: booking.bookingId,
      tripId: booking.tripId,
      name: booking.name,
      phone: booking.phone,
      studentId: booking.studentId,
      destination: booking.destination,
      pickup: booking.pickup,
      travelDate: booking.travelDate,
      seats: booking.seats,
      bookingType: booking.bookingType,
      paymentStatus: paidBookingFee ? "Booking Fee Paid" : "Transport Fare Paid",
      paymentConfirmedAt: paidBookingFee ? booking.bookingFeePaidAt : booking.farePaidAt,
      receiptNumber: booking.receiptNumber || txRef,
      fare:
        typeof booking.fare === "number" && Number.isFinite(booking.fare) && booking.fare > 0
          ? booking.fare
          : resolvedRouteFare,
    };
  }

  return NextResponse.json({
    success: true,
    status: "paid",
    paymentType: result.paymentType,
    bookingId: result.bookingId,
    receipt,
  });
}
