import { randomBytes } from "node:crypto";

export type PayChanguPaymentPurpose = "booking_fee" | "transport_fare";

const PURPOSE_PREFIX: Record<PayChanguPaymentPurpose, string> = {
  booking_fee: "TWH-BOOKINGFEE",
  transport_fare: "TWH-FARE",
};

// 16 bytes = 128 bits of CSPRNG entropy, hex-encoded (characters 0-9a-f
// only — unambiguous and safe for any URL, query string, or provider
// field, with no character-set assumptions needed).
//
// Deliberately NOT derived from a timestamp, booking ID, or any customer
// field: the reference must never leak name, email, phone, student ID,
// destination, travel date, or booking ID, and its uniqueness comes
// entirely from cryptographic randomness rather than time-based collision
// avoidance. payments.internal_reference carries a UNIQUE constraint (see
// db/migrations/2026_08_01_payments_wallet_audit_foundation.sql) — that is
// the final, authoritative uniqueness guarantee; this generator only needs
// to make a collision astronomically unlikely in practice, which 128 bits
// comfortably provides.
export function generatePaymentReference(purpose: PayChanguPaymentPurpose): string {
  const prefix = PURPOSE_PREFIX[purpose];
  const suffix = randomBytes(16).toString("hex");
  return `${prefix}-${suffix}`;
}
