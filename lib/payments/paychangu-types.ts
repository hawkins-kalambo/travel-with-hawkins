// Types for PayChangu's Standard Checkout API. Sourced from PayChangu's
// official developer docs (fetched 2026-08-01):
//   https://developer.paychangu.com/docs/standard-checkout
//   https://developer.paychangu.com/reference/initiate-transaction
//   https://developer.paychangu.com/docs/transaction-verification
//   https://developer.paychangu.com/docs/webhooks
//
// PayChangu's own pages are inconsistent with each other on some fields
// (e.g. `amount` is documented as `int32` on one page and `string` on
// another). These types are written defensively as a result: every field
// below is optional except the ones we ourselves supply in a request, and
// nothing here should be treated as authoritative just because it's typed.
// Real validation happens in lib/payments/verification-validator.ts, which
// re-checks every field it depends on at runtime rather than trusting this
// type annotation.

export type PayChanguCurrency = "MWK" | "USD";

export type PayChanguCustomization = {
  title?: string;
  description?: string;
  logo?: string;
};

export type PayChanguInitializeRequest = {
  amount: number;
  currency: PayChanguCurrency;
  callback_url: string;
  return_url: string;
  // We always generate and supply our own tx_ref (see reference.ts) —
  // never leave reference generation to PayChangu.
  tx_ref: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  customization?: PayChanguCustomization;
  // Extra bookkeeping only — the app must never trust values echoed back
  // in `meta` on a verify/webhook response over its own database records.
  meta?: Record<string, string | number | boolean>;
};

export type PayChanguInitializeResponse = {
  status?: string;
  message?: string;
  data?: {
    event?: string;
    checkout_url?: string;
    data?: {
      tx_ref?: string;
      currency?: string;
      amount?: number | string;
      mode?: string;
      status?: string;
    };
  };
};

export type PayChanguAuthorization = {
  channel?: string;
  card_number?: string;
  expiry?: string;
  brand?: string;
  provider?: string;
  mobile_number?: string;
  completed_at?: string;
};

export type PayChanguCustomer = {
  email?: string;
  first_name?: string;
  last_name?: string;
};

export type PayChanguTransactionLog = {
  type?: string;
  message?: string;
  created_at?: string;
};

// Only "success" is documented with certainty as the successful-payment
// value for `data.status`. Other statuses (pending/failed/cancelled/etc.)
// are plausible but not exhaustively confirmed, so this intentionally
// stays a loose string rather than a closed union — callers must check for
// the literal "success" and treat everything else as not-yet-successful,
// never assume the inverse.
export type PayChanguTransactionStatus = string;

export type PayChanguTransactionData = {
  event_type?: string;
  tx_ref?: string;
  mode?: string;
  type?: string;
  status?: PayChanguTransactionStatus;
  number_of_attempts?: number;
  reference?: string;
  currency?: string;
  amount?: number | string;
  charges?: number | string;
  customization?: PayChanguCustomization;
  authorization?: PayChanguAuthorization;
  customer?: PayChanguCustomer;
  meta?: Record<string, unknown>;
  logs?: PayChanguTransactionLog[];
  created_at?: string;
  updated_at?: string;
};

export type PayChanguVerifyResponse = {
  status?: string;
  message?: string;
  data?: PayChanguTransactionData;
};

export type PayChanguErrorResponse = {
  status?: string;
  message?: string;
  data?: null | Record<string, unknown>;
};

// Webhook POST body PayChangu sends to callback_url. Documented example
// uses event_type "api.charge.payment"; other event types are plausible.
// See docs/paychangu-phase3-design.md for how Phase 3C will derive a
// stable event identity from this shape.
export type PayChanguWebhookPayload = {
  event_type?: string;
  status?: PayChanguTransactionStatus;
  charge_id?: string;
  reference?: string;
  tx_ref?: string;
  currency?: string;
  amount?: number | string;
  authorization?: PayChanguAuthorization;
  customer?: PayChanguCustomer;
  created_at?: string;
  updated_at?: string;
};
