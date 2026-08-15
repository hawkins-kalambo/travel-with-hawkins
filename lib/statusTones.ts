import type { BadgeTone } from "@/app/components/ui/Badge";

// Consolidates the 5 independently-implemented status color maps found
// across the ambassador/admin/communications pages (STATUS_STYLES in
// applications, statusBadge() in the ambassador list, inline payment-status
// tone logic in referral-bookings, getPriorityStyles in the communication
// center, statusColors in support-tickets) into one place per domain. Pure
// functions, no React/Supabase dependency, so they're trivially reusable
// (and testable) anywhere a status string needs a consistent tone + label.

export function applicationStatusTone(status: string | null | undefined): BadgeTone {
  switch ((status || "").toLowerCase()) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "pending":
    default:
      return "warning";
  }
}

export function ambassadorStatusTone(status: string | null | undefined): BadgeTone {
  switch ((status || "").toLowerCase()) {
    case "active":
      return "success";
    case "suspended":
      return "danger";
    case "pending verification":
      return "warning";
    case "inactive":
    default:
      return "neutral";
  }
}

export function commissionStatusTone(status: string | null | undefined): BadgeTone {
  switch ((status || "").toLowerCase()) {
    case "paid":
      return "success";
    case "approved":
      return "info";
    case "cancelled":
      return "danger";
    case "pending":
    default:
      return "warning";
  }
}

export function ticketStatusTone(status: string | null | undefined): BadgeTone {
  switch ((status || "").toLowerCase()) {
    case "resolved":
      return "success";
    case "closed":
      return "neutral";
    case "in_progress":
    case "assigned":
      return "warning";
    case "open":
    default:
      return "info";
  }
}

export function ticketPriorityTone(priority: string | null | undefined): BadgeTone {
  switch ((priority || "").toLowerCase()) {
    case "high":
    case "urgent":
      return "danger";
    case "low":
      return "neutral";
    case "normal":
    default:
      return "info";
  }
}

export function operatorApplicationStatusTone(status: string | null | undefined): BadgeTone {
  switch ((status || "").toLowerCase()) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "changes_required":
      return "warning";
    case "under_review":
      return "info";
    case "submitted":
    case "draft":
    default:
      return "neutral";
  }
}

export function operatorDocumentStatusTone(status: string | null | undefined): BadgeTone {
  switch ((status || "").toLowerCase()) {
    case "verified":
      return "success";
    case "rejected":
    case "expired":
      return "danger";
    case "expiring":
      return "warning";
    case "replaced":
      return "neutral";
    case "pending":
    default:
      return "info";
  }
}

export type BookingPaymentSummary = {
  bookingStatus?: string | null;
  bookingFeeStatus?: string | null;
  fareStatus?: string | null;
};

/**
 * Compound status for the admin referral-bookings payment column — derived
 * from booking + booking-fee + fare status together, not a single field.
 */
export function bookingPaymentStatus(summary: BookingPaymentSummary | null | undefined): { label: string; tone: BadgeTone } {
  if (!summary) return { label: "Unknown", tone: "neutral" };

  const cancelled = summary.bookingStatus === "Cancelled";
  const feePaid = summary.bookingFeeStatus === "paid";
  const farePaid = summary.fareStatus === "paid";

  if (cancelled) return { label: "Booking cancelled", tone: "danger" };
  if (feePaid && farePaid) return { label: "Fully paid", tone: "success" };
  if (feePaid) return { label: "Fee paid, fare unpaid", tone: "warning" };
  return { label: "Unpaid", tone: "neutral" };
}
