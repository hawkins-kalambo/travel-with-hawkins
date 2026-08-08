import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { BookingRecord } from "@/lib/bookingUtils";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";
import { contactMatchesBooking, loadBookingById } from "@/lib/bookingAccess";

export const runtime = "nodejs";

// Guests must prove ownership of a booking with the ID *and* the contact
// info used to create it — a booking ID alone is not a secret. Errors are
// intentionally generic so a caller can't tell whether the ID or the
// contact was the mismatch.
const NOT_FOUND_MESSAGE =
  "We couldn't find a booking matching those details. Double-check your Booking ID and the email or phone number you used when booking.";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

// Only hand back what a guest needs to see their journey/payment status —
// not internal referral/ambassador/commission fields.
function toGuestSafeView(record: BookingRecord) {
  return {
    bookingId: record.bookingId,
    tripId: record.tripId,
    name: record.name,
    phone: record.phone,
    studentId: record.studentId,
    destination: record.destination,
    travelDate: record.travelDate,
    seats: record.seats,
    pickup: record.pickup,
    location: record.location,
    bookingType: record.bookingType,
    status: record.status,
    receiptNumber: record.receiptNumber,
    fare: record.fare,
    bookingFeeAmount: record.bookingFeeAmount,
    bookingFeeStatus: record.bookingFeeStatus,
    bookingFeePaidAt: record.bookingFeePaidAt,
    bookingExpiresAt: record.bookingExpiresAt,
    fareStatus: record.fareStatus,
    farePaymentMethod: record.farePaymentMethod,
    farePaidAt: record.farePaidAt,
    fareCashCollectedAt: record.fareCashCollectedAt,
  };
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (await isRateLimited(`track-booking:${ip}`)) {
    return jsonError("Too many requests. Please wait a moment and try again.", 429);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const bookingId = typeof payload.bookingId === "string" ? payload.bookingId.trim() : "";
  const contactRaw = typeof payload.contact === "string" ? payload.contact.trim() : "";

  if (!bookingId || !contactRaw) {
    return jsonError("Booking ID and the email or phone number used at booking are both required.", 400);
  }

  const lookup = await loadBookingById(bookingId);
  if (!lookup.found) {
    return jsonError(NOT_FOUND_MESSAGE, 404);
  }

  if (!contactMatchesBooking(lookup.booking, contactRaw)) {
    return jsonError(NOT_FOUND_MESSAGE, 404);
  }

  return NextResponse.json({ success: true, booking: toGuestSafeView(lookup.booking) });
}
