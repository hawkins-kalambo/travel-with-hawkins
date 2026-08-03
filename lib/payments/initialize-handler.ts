import "server-only";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRateLimited } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/clientIp";
import { initiatePayChanguPayment } from "./payment-service";
import type { PayChanguPaymentPurpose } from "./reference";

// Shared by app/api/payments/booking-fee/initialize/route.ts and
// app/api/payments/fare/initialize/route.ts — the two routes differ only
// in which payment_type they initiate; every other concern (rate limiting,
// input parsing, error-message mapping) is identical and kept in one place
// so the two can't drift apart.

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

// Deliberately generic, customer-safe messages — internal reason codes
// (see lib/payments/payment-service.ts) are logged server-side, not
// returned verbatim to the browser.
const REJECTION_MESSAGES: Record<string, string> = {
  missing_booking_or_contact: "Booking ID and the email or phone number used at booking are both required.",
  booking_not_found: "We couldn't find a booking matching those details.",
  booking_cancelled: "This booking has been cancelled and can no longer be paid for.",
  booking_expired: "This booking has expired. Please contact support.",
  booking_fee_already_paid: "The booking fee for this booking has already been paid.",
  booking_fee_not_paid: "The booking fee must be paid before the transport fare can be paid online.",
  fare_already_paid: "The transport fare for this booking has already been paid.",
  amount_not_configured: "This booking doesn't have a payable amount configured yet. Please contact support.",
};

function messageFor(reason: string): string {
  return REJECTION_MESSAGES[reason] || "Payment could not be started right now. Please try again shortly.";
}

function statusFor(reason: string): number {
  if (reason === "booking_not_found") return 404;
  if (reason === "missing_booking_or_contact") return 400;
  return 409;
}

export async function handleInitializeRequest(req: NextRequest, paymentType: PayChanguPaymentPurpose): Promise<NextResponse> {
  const ip = getClientIp(req);
  if (await isRateLimited(`payments:${paymentType}:initialize:${ip}`)) {
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

  if (!bookingId || !contact) {
    return jsonError(messageFor("missing_booking_or_contact"), 400);
  }

  const result = await initiatePayChanguPayment({
    bookingId,
    contact,
    paymentType,
    customerId: null,
  });

  if (result.outcome === "rejected") {
    return jsonError(messageFor(result.reason), statusFor(result.reason));
  }

  return NextResponse.json({
    success: true,
    checkoutUrl: result.checkoutUrl,
    txRef: result.txRef,
    amount: result.amount,
  });
}
