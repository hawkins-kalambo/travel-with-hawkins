import type { JourneyStatus } from "@/lib/bookingUtils";

export const JOURNEY_STATUS_COLORS: Record<string, { badge: string; button: string }> = {
  Booked: { badge: "bg-amber-50 text-amber-700 border-amber-200", button: "bg-amber-600 hover:bg-amber-700" },
  Confirmed: { badge: "bg-[#eef6ff] text-[#0a2d56] border-[#b8dcff]", button: "bg-[#0f3f78] hover:bg-[#0a2d56]" },
  Boarding: { badge: "bg-orange-50 text-orange-700 border-orange-200", button: "bg-orange-600 hover:bg-orange-700" },
  Departed: { badge: "bg-violet-50 text-violet-700 border-violet-200", button: "bg-violet-600 hover:bg-violet-700" },
  Arrived: { badge: "bg-sky-50 text-sky-700 border-sky-200", button: "bg-sky-600 hover:bg-sky-700" },
  Completed: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", button: "bg-emerald-600 hover:bg-emerald-700" },
  Cancelled: {
    badge: "bg-[color:var(--danger)]/10 text-[color:var(--danger)] border-[color:var(--danger)]/20",
    button: "bg-[color:var(--danger)] hover:bg-[color:var(--danger)]/90",
  },
};

/** Journey-status pill used across the admin Trips/Bookings/Students screens. */
export default function JourneyStatusBadge({ status }: { status: JourneyStatus }) {
  const s = String(status || "Booked");
  const colors = JOURNEY_STATUS_COLORS[s] ?? JOURNEY_STATUS_COLORS.Booked;
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold border ${colors.badge}`}>{s}</span>;
}
