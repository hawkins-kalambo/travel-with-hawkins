import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRateLimited } from "@/lib/rateLimit";
import { selectCashFarePayment } from "@/lib/payments/payment-service";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

// Deliberately generic, customer-safe messages — internal reason codes are
// logged server-side, not returned verbatim to the browser (same pattern as
// lib/payments/initialize-handler.ts).
const REJECTION_MESSAGES: Record<string, string> = {
  missing_booking_or_contact: "Booking ID and the email or phone number used at booking are both required.",
  booking_not_found: "We couldn't find a booking matching those details.",
  booking_cancelled: "This booking has been cancelled.",
  booking_fee_not_paid: "The booking fee must be paid before choosing how to pay the fare.",
  fare_already_paid: "The transport fare for this booking has already been settled.",
};

function messageFor(reason: string): string {
  return REJECTION_MESSAGES[reason] || "Could not save your choice right now. Please try again shortly.";
}

function statusFor(reason: string): number {
  if (reason === "booking_not_found") return 404;
  if (reason === "missing_booking_or_contact") return 400;
  return 409;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "local";
  if (isRateLimited(`payments:fare:select-cash:${ip}`)) {
    return jsonError("Too many requests. Please wait a moment and try again.", 429);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const bookingId = typeof payload.bookingId === "string" ? payload.bookingId.trim() : "";
  const contact = typeof payload.contact === "string" ? payload.contact.trim() : "";

  const result = await selectCashFarePayment(bookingId, contact);

  if (result.outcome === "rejected") {
    return jsonError(messageFor(result.reason), statusFor(result.reason));
  }

  return NextResponse.json({ success: true });
}
