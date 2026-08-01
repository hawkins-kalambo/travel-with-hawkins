// Types for the payments / wallet / payout foundation added in
// db/migrations/2026_08_01_payments_wallet_audit_foundation.sql.
//
// These are intentionally separate from bookingTypes.ts's JourneyStatus /
// PaymentStatus, which describe the legacy single `payment_status` field on
// bookings. BookingFeeStatus and FareStatus below describe the new split
// fields (`booking_fee_status`, `fare_status`).

export const BOOKING_FEE_STATUS_VALUES = [
  "unpaid",
  "processing",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
] as const;
export type BookingFeeStatus = (typeof BOOKING_FEE_STATUS_VALUES)[number];

export const FARE_STATUS_VALUES = [
  "unpaid",
  "processing",
  "paid",
  "cash_selected",
  "cash_collected",
  "partially_paid",
  "failed",
  "refunded",
] as const;
export type FareStatus = (typeof FARE_STATUS_VALUES)[number];

export const PAYMENT_METHOD_VALUES = ["paychangu", "cash", "bank_transfer", "manual_adjustment"] as const;
export type PaymentMethod = (typeof PAYMENT_METHOD_VALUES)[number];

export const PAYMENT_TYPE_VALUES = ["booking_fee", "transport_fare", "ambassador_payout", "refund", "adjustment"] as const;
export type PaymentType = (typeof PAYMENT_TYPE_VALUES)[number];

export const PAYMENT_RECORD_STATUS_VALUES = [
  "initialized",
  "processing",
  "paid",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
] as const;
export type PaymentRecordStatus = (typeof PAYMENT_RECORD_STATUS_VALUES)[number];

export const PAYOUT_METHOD_VALUES = ["airtel_money", "tnm_mpamba", "bank_transfer", "other"] as const;
export type PayoutMethod = (typeof PAYOUT_METHOD_VALUES)[number];

export const PAYOUT_STATUS_VALUES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "processing",
  "paid",
  "failed",
  "cancelled",
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUS_VALUES)[number];

// Payout statuses that count as "active" — a new request cannot be submitted
// while one of these exists, mirrored by the DB's partial unique index.
export const ACTIVE_PAYOUT_STATUSES: readonly PayoutStatus[] = ["draft", "submitted", "under_review", "approved", "processing"];

export const WALLET_TRANSACTION_TYPE_VALUES = [
  "commission_credit",
  "commission_reversal",
  "payout_reservation",
  "payout_completion",
  "payout_failure_release",
  "manual_adjustment",
] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPE_VALUES)[number];

export const WALLET_DIRECTION_VALUES = ["credit", "debit"] as const;
export type WalletDirection = (typeof WALLET_DIRECTION_VALUES)[number];

export const WALLET_BALANCE_CATEGORY_VALUES = ["pending", "available", "reserved", "paid"] as const;
export type WalletBalanceCategory = (typeof WALLET_BALANCE_CATEGORY_VALUES)[number];

export type Payment = {
  id: string;
  bookingId: string | null;
  customerId: string | null;
  ambassadorId: string | null;
  paymentType: PaymentType;
  provider: string;
  internalReference: string;
  providerReference: string | null;
  currency: string;
  expectedAmount: number;
  paidAmount: number | null;
  status: PaymentRecordStatus;
  paymentMethod: PaymentMethod | null;
  providerStatus: string | null;
  failureReason: string | null;
  metadata: Record<string, unknown>;
  initializedAt: string;
  verifiedAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  refundedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayoutRequest = {
  id: string;
  ambassadorId: string;
  requestedAmount: number;
  currency: string;
  payoutMethod: PayoutMethod;
  destinationDetails: Record<string, unknown>;
  status: PayoutStatus;
  reviewerId: string | null;
  reviewerNotes: string | null;
  rejectionReason: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  paymentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WalletTransaction = {
  id: string;
  ambassadorId: string;
  referralId: string | null;
  payoutRequestId: string | null;
  transactionType: WalletTransactionType;
  direction: WalletDirection;
  amount: number;
  currency: string;
  balanceCategory: WalletBalanceCategory;
  status: "posted" | "reversed";
  description: string | null;
  reference: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
};

export type AmbassadorWalletBalance = {
  ambassadorId: string;
  pendingBalance: number;
  availableBalance: number;
  reservedBalance: number;
  paidTotal: number;
};

export type AuditLogEntry = {
  id: string;
  actorUserId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  previousValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};
