import type { JourneyStatus, PaymentStatus } from "@/lib/bookingTypes";

export const JOURNEY_STATUS_VALUES = ["Booked", "Confirmed", "Boarding", "Arrived", "Completed", "Cancelled"] as const;
export const PAYMENT_STATUS_VALUES = ["Pending", "Payment Confirmed", "Failed"] as const;

const JOURNEY_STATUS_NORMALIZATION: Record<string, JourneyStatus> = {
  booked: "Booked",
  confirmed: "Confirmed",
  boarding: "Boarding",
  arrived: "Arrived",
  completed: "Completed",
  cancelled: "Cancelled",
  departed: "Boarding",
  "in route": "Boarding",
  "en route": "Boarding",
};

const PAYMENT_STATUS_NORMALIZATION: Record<string, PaymentStatus> = {
  pending: "Pending",
  "payment confirmed": "Payment Confirmed",
  confirmed: "Payment Confirmed",
  failed: "Failed",
};

export function normalizeJourneyStatus(value: unknown): JourneyStatus {
  const raw = typeof value === "string" ? value.trim() : "";
  const normalized = raw.toLowerCase();
  return JOURNEY_STATUS_NORMALIZATION[normalized] ?? (raw || "Booked");
}

export function normalizePaymentStatus(value: unknown): PaymentStatus {
  const raw = typeof value === "string" ? value.trim() : "";
  const normalized = raw.toLowerCase();
  return PAYMENT_STATUS_NORMALIZATION[normalized] ?? (raw || "Pending");
}

export function isValidPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && (PAYMENT_STATUS_VALUES as readonly string[]).includes(value);
}

export function isValidJourneyStatus(value: unknown): value is JourneyStatus {
  return typeof value === "string" && (JOURNEY_STATUS_VALUES as readonly string[]).includes(value);
}
