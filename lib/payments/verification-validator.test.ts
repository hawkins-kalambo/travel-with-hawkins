import test from "node:test";
import assert from "node:assert/strict";
import { validatePayChanguVerification, type LocalPaymentRecord } from "./verification-validator.ts";
import type { PayChanguVerifyResponse } from "./paychangu-types.ts";

const basePayment: LocalPaymentRecord = {
  internalReference: "TWH-BOOKINGFEE-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  paymentType: "booking_fee",
  bookingId: "BK-TEST-0001",
  expectedAmount: 5000,
  currency: "MWK",
  status: "initialized",
};

function successResponse(overrides: Partial<NonNullable<PayChanguVerifyResponse["data"]>> = {}): PayChanguVerifyResponse {
  return {
    status: "success",
    message: "ok",
    data: {
      tx_ref: basePayment.internalReference,
      status: "success",
      currency: "MWK",
      amount: 5000,
      reference: "PC-REF-123",
      ...overrides,
    },
  };
}

test("valid successful payment", () => {
  const result = validatePayChanguVerification(successResponse(), basePayment);
  assert.equal(result.outcome, "valid");
  if (result.outcome === "valid") {
    assert.equal(result.amount, 5000);
    assert.equal(result.currency, "MWK");
    assert.equal(result.txRef, basePayment.internalReference);
    assert.equal(result.providerReference, "PC-REF-123");
    assert.equal(result.paymentType, "booking_fee");
    assert.equal(result.bookingId, "BK-TEST-0001");
  }
});

test("incorrect tx_ref is rejected", () => {
  const result = validatePayChanguVerification(successResponse({ tx_ref: "TWH-BOOKINGFEE-someoneElsesRef00000000000000" }), basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "tx_ref_mismatch" });
});

test("missing tx_ref is rejected", () => {
  const result = validatePayChanguVerification(successResponse({ tx_ref: undefined }), basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "missing_tx_ref" });
});

test("pending payment is reported as pending, not rejected", () => {
  const result = validatePayChanguVerification(successResponse({ status: "pending" }), basePayment);
  assert.deepEqual(result, { outcome: "pending", providerStatus: "pending" });
});

test("failed payment is reported as pending with providerStatus failed", () => {
  const result = validatePayChanguVerification(successResponse({ status: "failed" }), basePayment);
  assert.deepEqual(result, { outcome: "pending", providerStatus: "failed" });
});

test("cancelled payment is reported as pending with providerStatus cancelled", () => {
  const result = validatePayChanguVerification(successResponse({ status: "cancelled" }), basePayment);
  assert.deepEqual(result, { outcome: "pending", providerStatus: "cancelled" });
});

test("currency mismatch against the stored payment is rejected", () => {
  const payment: LocalPaymentRecord = { ...basePayment, currency: "MWK" };
  const result = validatePayChanguVerification(successResponse({ currency: "USD" }), payment);
  // USD also fails the "must be MWK" rule first — either reason is a valid
  // rejection; assert it's rejected and specifically flags currency.
  assert.equal(result.outcome, "rejected");
  if (result.outcome === "rejected") {
    assert.equal(result.reason, "unsupported_currency");
  }
});

test("currency mismatch when both are non-MWK is still rejected as unsupported", () => {
  const payment: LocalPaymentRecord = { ...basePayment, currency: "ZAR" };
  const result = validatePayChanguVerification(successResponse({ currency: "ZAR" }), payment);
  assert.deepEqual(result, { outcome: "rejected", reason: "unsupported_currency" });
});

test("missing currency is rejected", () => {
  const result = validatePayChanguVerification(successResponse({ currency: undefined }), basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "missing_currency" });
});

test("underpayment is rejected", () => {
  const result = validatePayChanguVerification(successResponse({ amount: 4999 }), basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "amount_mismatch" });
});

test("overpayment is rejected", () => {
  const result = validatePayChanguVerification(successResponse({ amount: 5001 }), basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "amount_mismatch" });
});

test("decimal amount is rejected as malformed", () => {
  const result = validatePayChanguVerification(successResponse({ amount: 5000.5 }), basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "malformed_amount" });
});

test("decimal amount as a string is rejected as malformed", () => {
  const result = validatePayChanguVerification(successResponse({ amount: "5000.50" }), basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "malformed_amount" });
});

test("malformed non-numeric amount string is rejected", () => {
  const result = validatePayChanguVerification(successResponse({ amount: "five-thousand" }), basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "malformed_amount" });
});

test("NaN amount is rejected as malformed", () => {
  const result = validatePayChanguVerification(successResponse({ amount: Number.NaN }), basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "malformed_amount" });
});

test("missing verification data is rejected", () => {
  const result = validatePayChanguVerification({ status: "success", data: undefined }, basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "missing_verification_data" });
});

test("missing top-level response is rejected", () => {
  const result = validatePayChanguVerification(null, basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "invalid_top_level_status" });
});

test("non-success top-level status is rejected", () => {
  const result = validatePayChanguVerification({ status: "failed", data: { tx_ref: basePayment.internalReference } }, basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "invalid_top_level_status" });
});

test("negative amount (number) is rejected", () => {
  const result = validatePayChanguVerification(successResponse({ amount: -5000 }), basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "negative_amount" });
});

test("negative amount (string) is rejected", () => {
  const result = validatePayChanguVerification(successResponse({ amount: "-5000" }), basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "negative_amount" });
});

test("missing amount is rejected", () => {
  const result = validatePayChanguVerification(successResponse({ amount: undefined }), basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "missing_amount" });
});

test("unsafe integer amount is rejected", () => {
  const unsafe = Number.MAX_SAFE_INTEGER + 10;
  const result = validatePayChanguVerification(successResponse({ amount: unsafe }), basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "unsafe_amount" });
});

test("unsafe integer amount as an oversized numeric string is rejected", () => {
  const result = validatePayChanguVerification(successResponse({ amount: "99999999999999999999" }), basePayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "unsafe_amount" });
});

test("already-paid consistent replay returns already_finalized", () => {
  const paidPayment: LocalPaymentRecord = {
    ...basePayment,
    status: "paid",
    paidAmount: 5000,
    providerReference: "PC-REF-123",
  };
  const result = validatePayChanguVerification(successResponse(), paidPayment);
  assert.equal(result.outcome, "already_finalized");
  if (result.outcome === "already_finalized") {
    assert.equal(result.amount, 5000);
    assert.equal(result.providerReference, "PC-REF-123");
  }
});

test("already-paid contradictory replay (different amount) is rejected", () => {
  const paidPayment: LocalPaymentRecord = {
    ...basePayment,
    status: "paid",
    paidAmount: 4000, // different from the 5000 in this verification response
    providerReference: "PC-REF-123",
  };
  const result = validatePayChanguVerification(successResponse(), paidPayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "contradictory_replay" });
});

test("already-paid contradictory replay (different provider reference) is rejected", () => {
  const paidPayment: LocalPaymentRecord = {
    ...basePayment,
    status: "paid",
    paidAmount: 5000,
    providerReference: "PC-REF-OLD",
  };
  const result = validatePayChanguVerification(successResponse({ reference: "PC-REF-NEW" }), paidPayment);
  assert.deepEqual(result, { outcome: "rejected", reason: "contradictory_replay" });
});

test("provider meta cannot override booking_id, payment_type, or amount", () => {
  const spoofedMeta = {
    booking_id: "BK-SOMEONE-ELSES-BOOKING",
    payment_type: "ambassador_payout",
    amount: 999999999,
  };
  const result = validatePayChanguVerification(successResponse({ meta: spoofedMeta }), basePayment);
  assert.equal(result.outcome, "valid");
  if (result.outcome === "valid") {
    // Everything in the result must come from `basePayment` (our DB), not
    // from the spoofed meta on the provider response.
    assert.equal(result.bookingId, basePayment.bookingId);
    assert.equal(result.paymentType, basePayment.paymentType);
    assert.equal(result.amount, 5000);
  }
});
