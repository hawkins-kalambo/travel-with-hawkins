import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { BookingRecord } from "@/lib/bookingUtils";
import { loadBookingById, contactMatchesBooking } from "@/lib/bookingAccess";
import { generatePaymentReference, type PayChanguPaymentPurpose } from "./reference";
import { initializePayChanguPayment, PayChanguClientError } from "./paychangu-client";
import { PayChanguConfigError } from "./env";
import type { PayChanguCurrency } from "./paychangu-types";
import { logError } from "@/lib/logger";

const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://travelwithhawkins.com").replace(/\/+$/, "");
const CURRENCY: PayChanguCurrency = "MWK";

export type InitiatePaymentInput = {
  bookingId: string;
  // Same proof of ownership as guest booking tracking (Phase 2) — the
  // email or phone number used when the booking was created. Required for
  // every caller, authenticated or not: there is currently no other
  // reliable link between a logged-in customer account and a specific
  // booking (see docs/paychangu-phase3-design.md and the Phase 3 report).
  contact: string;
  paymentType: PayChanguPaymentPurpose;
  // Set only when the caller is a signed-in customer, purely for
  // bookkeeping (lets the "customers can view own payments" RLS policy
  // work later) — never used as the authorization decision itself.
  customerId?: string | null;
};

export type InitiatePaymentResult =
  | { outcome: "initialized"; checkoutUrl: string; txRef: string; amount: number }
  | { outcome: "rejected"; reason: string };

function getExpectedAmount(booking: BookingRecord, paymentType: PayChanguPaymentPurpose): number | undefined {
  return paymentType === "booking_fee" ? booking.bookingFeeAmount : booking.fare;
}

function splitName(fullName: string | undefined): { firstName?: string; lastName?: string } {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  const [firstName, ...rest] = parts;
  return { firstName, lastName: rest.join(" ") || undefined };
}

// Server-side amount/eligibility authority. The caller (an API route) is
// responsible for rate limiting; this function owns every decision about
// whether a payment attempt is allowed to start and, if so, exactly how
// much it's for — none of that is ever accepted from the client.
export async function initiatePayChanguPayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
  const bookingId = input.bookingId.trim();
  const contact = input.contact.trim();

  if (!bookingId || !contact) {
    return { outcome: "rejected", reason: "missing_booking_or_contact" };
  }

  const lookup = await loadBookingById(bookingId);
  if (!lookup.found) {
    return { outcome: "rejected", reason: "booking_not_found" };
  }

  // Deliberately the same rejection reason as "not found" above — a caller
  // probing with a valid booking ID and wrong contact must not be able to
  // distinguish "wrong contact" from "no such booking".
  if (!contactMatchesBooking(lookup.booking, contact)) {
    return { outcome: "rejected", reason: "booking_not_found" };
  }

  const booking = lookup.booking;

  if (booking.status === "Cancelled") {
    return { outcome: "rejected", reason: "booking_cancelled" };
  }

  if (input.paymentType === "booking_fee") {
    if (booking.bookingFeeStatus === "paid") {
      return { outcome: "rejected", reason: "booking_fee_already_paid" };
    }
    if (booking.bookingExpiresAt && new Date(booking.bookingExpiresAt).getTime() < Date.now()) {
      return { outcome: "rejected", reason: "booking_expired" };
    }
  } else {
    // Transport fare can only be paid online once the booking fee is
    // settled — the fee is what confirms the seat; the fare is a separate,
    // later step (see db/migrations/2026_08_01_payments_wallet_audit_foundation.sql).
    if (booking.bookingFeeStatus !== "paid") {
      return { outcome: "rejected", reason: "booking_fee_not_paid" };
    }
    if (booking.fareStatus === "paid") {
      return { outcome: "rejected", reason: "fare_already_paid" };
    }
  }

  const expectedAmount = getExpectedAmount(booking, input.paymentType);
  if (typeof expectedAmount !== "number" || !Number.isFinite(expectedAmount) || expectedAmount <= 0) {
    return { outcome: "rejected", reason: "amount_not_configured" };
  }

  const txRef = generatePaymentReference(input.paymentType);

  const insertResult = await supabaseAdmin
    .from("payments")
    .insert([
      {
        booking_id: booking.bookingId,
        customer_id: input.customerId ?? null,
        payment_type: input.paymentType,
        provider: "paychangu",
        internal_reference: txRef,
        currency: CURRENCY,
        expected_amount: expectedAmount,
        status: "initialized",
      },
    ])
    .select()
    .single();

  if (insertResult.error || !insertResult.data) {
    logError("Failed to create payments row", { error: insertResult.error?.message, paymentType: input.paymentType });
    return { outcome: "rejected", reason: "payment_record_creation_failed" };
  }

  const paymentRowId = insertResult.data.id as string;
  const { firstName, lastName } = splitName(booking.name);

  let checkoutUrl: string | undefined;
  try {
    const response = await initializePayChanguPayment({
      amount: expectedAmount,
      currency: CURRENCY,
      callback_url: `${APP_BASE_URL}/api/payments/webhook`,
      return_url: `${APP_BASE_URL}/payment/return?tx_ref=${encodeURIComponent(txRef)}`,
      tx_ref: txRef,
      first_name: firstName,
      last_name: lastName,
      email: booking.email || undefined,
      customization: {
        title: "Travel With Hawkins",
        description: input.paymentType === "booking_fee" ? "Booking fee" : "Transport fare",
      },
    });

    checkoutUrl = response?.data?.checkout_url;
  } catch (error) {
    const reason =
      error instanceof PayChanguClientError ? error.code : error instanceof PayChanguConfigError ? "provider_not_configured" : "unknown_error";
    logError("PayChangu initialization failed", { txRef, reason });

    await supabaseAdmin
      .from("payments")
      .update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: reason })
      .eq("id", paymentRowId);

    return { outcome: "rejected", reason: "provider_initialization_failed" };
  }

  if (!checkoutUrl) {
    logError("PayChangu initialization returned no checkout_url", { txRef });
    await supabaseAdmin
      .from("payments")
      .update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: "missing_checkout_url" })
      .eq("id", paymentRowId);
    return { outcome: "rejected", reason: "provider_initialization_failed" };
  }

  await supabaseAdmin
    .from("payments")
    .update({ metadata: { checkout_url: checkoutUrl } })
    .eq("id", paymentRowId);

  return { outcome: "initialized", checkoutUrl, txRef, amount: expectedAmount };
}
