// Real per-booking payment truth (set by PayChangu webhooks and cash
// collection, see lib/payments/payment-service.ts) — distinct from the
// legacy journey `paymentStatus` field, which only the manual "Confirm
// Payment" admin action moves.
export const BOOKING_FEE_STATUS_COLORS: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  unpaid: "bg-[color:var(--warning)]/10 text-[color:var(--warning)] border-[color:var(--warning)]/20",
  processing: "bg-sky-50 text-sky-700 border-sky-200",
  failed: "bg-[color:var(--danger)]/10 text-[color:var(--danger)] border-[color:var(--danger)]/20",
  refunded: "bg-slate-100 text-slate-600 border-slate-200",
  partially_refunded: "bg-slate-100 text-slate-600 border-slate-200",
};

export const FARE_STATUS_COLORS: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cash_collected: "bg-emerald-50 text-emerald-700 border-emerald-200",
  unpaid: "bg-[color:var(--warning)]/10 text-[color:var(--warning)] border-[color:var(--warning)]/20",
  cash_selected: "bg-amber-50 text-amber-700 border-amber-200",
  processing: "bg-sky-50 text-sky-700 border-sky-200",
  partially_paid: "bg-amber-50 text-amber-700 border-amber-200",
  failed: "bg-[color:var(--danger)]/10 text-[color:var(--danger)] border-[color:var(--danger)]/20",
  refunded: "bg-slate-100 text-slate-600 border-slate-200",
};

function statusLabel(status: string): string {
  return status
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

/** Booking-fee / fare payment status pill used across the admin Bookings/Students screens. */
export default function MoneyStatusBadge({ status, colors }: { status: string; colors: Record<string, string> }) {
  const cls = colors[status] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold border ${cls}`}>{statusLabel(status)}</span>;
}
