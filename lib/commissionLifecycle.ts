// Fixes AMB-002 from docs/ambassador-system-audit.md — nothing previously
// reversed a commission when its booking was cancelled, so an ambassador
// could be paid commission on a trip that never happened. Kept as pure
// functions (no Supabase calls) so the decision logic is unit-testable.

export type CommissionStatus = "pending" | "approved" | "paid" | "cancelled";

/**
 * A commission is only auto-reversed if it hasn't been paid yet. A `paid`
 * commission means real money may already have moved — that always
 * requires a human decision, never an automatic reversal.
 */
export function shouldReverseCommission(bookingStatus: string, currentCommissionStatus: string | null | undefined): boolean {
  return bookingStatus === "Cancelled" && (currentCommissionStatus === "pending" || currentCommissionStatus === "approved");
}

export function isCommissionNeedingManualReview(bookingStatus: string, currentCommissionStatus: string | null | undefined): boolean {
  return bookingStatus === "Cancelled" && currentCommissionStatus === "paid";
}

export function buildCommissionReversalUpdate(reason: string, now: Date = new Date()) {
  return {
    commission_status: "cancelled" as const,
    cancelled_reason: reason,
    reversed_at: now.toISOString(),
  };
}
