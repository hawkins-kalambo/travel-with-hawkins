import type { PayChanguVerifyResponse } from "./paychangu-types";

// Pure comparison between a PayChangu verify-payment response and our own
// payments row. This function makes no network calls, touches no database,
// and never throws for a normal (even maliciously malformed) input — every
// outcome, including "this is garbage", is expressed through the return
// value so callers can log/handle it deliberately instead of via a
// try/catch.
//
// Everything this function treats as authoritative — payment_type, the
// booking it belongs to, expected_amount, expected currency, and current
// status — comes from `localPayment`, which the caller loads from
// public.payments before calling this function. Nothing from the
// PayChangu response (including `data.meta`) is ever allowed to override
// those values; the response is only used to confirm the provider agrees
// with what we already believe should be true.

export type LocalPaymentRecord = {
  internalReference: string; // payments.internal_reference — our tx_ref
  paymentType: string; // payments.payment_type — from OUR db, never from the provider
  bookingId: string; // payments.booking_id — from OUR db, never from the provider
  expectedAmount: number; // payments.expected_amount
  currency: string; // payments.currency
  status: string; // payments.status (e.g. "initialized", "paid", ...)
  paidAmount?: number | null; // payments.paid_amount, if already finalized
  providerReference?: string | null; // payments.provider_reference, if already finalized
};

export type VerificationResult =
  | {
      outcome: "valid";
      txRef: string;
      currency: string;
      amount: number;
      providerReference?: string;
      providerStatus: string;
      paymentType: string;
      bookingId: string;
    }
  | {
      outcome: "pending";
      providerStatus?: string;
    }
  | {
      outcome: "already_finalized";
      txRef: string;
      currency: string;
      amount: number;
      providerReference?: string;
      paymentType: string;
      bookingId: string;
    }
  | {
      outcome: "rejected";
      reason: string;
    };

type AmountParseResult =
  | { ok: true; value: number }
  | { ok: false; reason: "missing_amount" | "malformed_amount" | "negative_amount" | "unsafe_amount" };

// PayChangu's own docs disagree with themselves on whether `amount` is a
// number or a string, so both are accepted here — but only in the exact
// shape of a plain non-negative integer. Decimals, exponents, thousands
// separators, leading '+', and anything not a safe integer are rejected
// outright rather than coerced.
function parseAuthoritativeAmount(rawAmount: unknown): AmountParseResult {
  if (rawAmount === undefined || rawAmount === null) {
    return { ok: false, reason: "missing_amount" };
  }

  if (typeof rawAmount === "number") {
    if (!Number.isFinite(rawAmount)) return { ok: false, reason: "malformed_amount" };
    if (!Number.isInteger(rawAmount)) return { ok: false, reason: "malformed_amount" };
    if (rawAmount < 0) return { ok: false, reason: "negative_amount" };
    if (!Number.isSafeInteger(rawAmount)) return { ok: false, reason: "unsafe_amount" };
    return { ok: true, value: rawAmount };
  }

  if (typeof rawAmount === "string") {
    const trimmed = rawAmount.trim();
    if (!trimmed) return { ok: false, reason: "missing_amount" };
    if (/^-\d+$/.test(trimmed)) return { ok: false, reason: "negative_amount" };
    if (!/^\d+$/.test(trimmed)) return { ok: false, reason: "malformed_amount" };
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed)) return { ok: false, reason: "unsafe_amount" };
    return { ok: true, value: parsed };
  }

  return { ok: false, reason: "malformed_amount" };
}

export function validatePayChanguVerification(
  verifyResponse: PayChanguVerifyResponse | null | undefined,
  localPayment: LocalPaymentRecord
): VerificationResult {
  // 1. Top-level API response must indicate success.
  if (!verifyResponse || verifyResponse.status !== "success") {
    return { outcome: "rejected", reason: "invalid_top_level_status" };
  }

  // 2. Verification data must exist.
  const data = verifyResponse.data;
  if (!data || typeof data !== "object") {
    return { outcome: "rejected", reason: "missing_verification_data" };
  }

  // 3/4. tx_ref must exactly equal our stored internal_reference.
  const providerTxRef = typeof data.tx_ref === "string" ? data.tx_ref.trim() : "";
  if (!providerTxRef) {
    return { outcome: "rejected", reason: "missing_tx_ref" };
  }
  if (providerTxRef !== localPayment.internalReference) {
    return { outcome: "rejected", reason: "tx_ref_mismatch" };
  }

  // Provider payment status: only the literal "success" counts as a
  // completed payment. Pending, failed, cancelled, or any unrecognized
  // status is reported as "pending" (not "rejected") — it isn't evidence
  // of tampering, it just isn't a finalized payment yet.
  const providerStatus = typeof data.status === "string" ? data.status : undefined;
  if (providerStatus !== "success") {
    return { outcome: "pending", providerStatus };
  }

  // 5/6. Currency must exactly match what we stored, and must be MWK for
  // this integration.
  const providerCurrency = typeof data.currency === "string" ? data.currency.trim().toUpperCase() : "";
  if (!providerCurrency) {
    return { outcome: "rejected", reason: "missing_currency" };
  }
  if (providerCurrency !== "MWK") {
    return { outcome: "rejected", reason: "unsupported_currency" };
  }
  if (providerCurrency !== localPayment.currency.trim().toUpperCase()) {
    return { outcome: "rejected", reason: "currency_mismatch" };
  }

  // 7/8/9/10. Amount must be a well-formed non-negative safe integer that
  // exactly equals expected_amount — no underpayment or overpayment
  // acceptance.
  const amountResult = parseAuthoritativeAmount(data.amount);
  if (!amountResult.ok) {
    return { outcome: "rejected", reason: amountResult.reason };
  }
  if (amountResult.value !== localPayment.expectedAmount) {
    return { outcome: "rejected", reason: "amount_mismatch" };
  }

  // 13. `data.meta` is never read for booking_id/payment_type/amount — it
  // simply isn't referenced anywhere above. paymentType/bookingId in the
  // result below come from `localPayment` (our database), not the response.
  const providerReference = typeof data.reference === "string" && data.reference.trim() ? data.reference.trim() : undefined;

  // 14. Idempotent replay handling: if we already recorded this payment as
  // paid, this verification must be CONSISTENT with what's already stored,
  // not merely "also successful" — the same tx_ref succeeding twice with a
  // different amount or provider reference is contradictory, not routine.
  if (localPayment.status === "paid") {
    const consistent =
      (localPayment.paidAmount ?? null) === amountResult.value && (localPayment.providerReference ?? null) === (providerReference ?? null);

    if (consistent) {
      return {
        outcome: "already_finalized",
        txRef: providerTxRef,
        currency: providerCurrency,
        amount: amountResult.value,
        providerReference,
        paymentType: localPayment.paymentType,
        bookingId: localPayment.bookingId,
      };
    }

    return { outcome: "rejected", reason: "contradictory_replay" };
  }

  return {
    outcome: "valid",
    txRef: providerTxRef,
    currency: providerCurrency,
    amount: amountResult.value,
    providerReference,
    providerStatus,
    paymentType: localPayment.paymentType,
    bookingId: localPayment.bookingId,
  };
}
