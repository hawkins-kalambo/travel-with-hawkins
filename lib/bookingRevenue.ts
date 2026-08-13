import type { BookingRecord } from "@/lib/bookingTypes";
import { resolveRouteFareIfAvailable } from "@/lib/routePricing";

export type BookingRevenue = { ticketRevenue: number; bookingFee: number; total: number };

// Single source of truth for "how much has actually been collected on this
// booking" — used by the admin dashboard's revenue tiles, the Students CRM
// spend totals, and the Reports summary/exports. Revenue only counts what's
// actually marked paid (bookingFeeStatus/fareStatus), never the nominal
// fare/fee amount regardless of payment state.
export function calcBookingRevenue(
  booking: Pick<BookingRecord, "destination" | "seats" | "fare" | "bookingFeeAmount" | "bookingFeeStatus" | "fareStatus">,
  routesStr: string | Record<string, unknown> | undefined
): BookingRevenue {
  const routePrice = resolveRouteFareIfAvailable(booking.destination, routesStr) ?? 0;
  const ticketPrice = typeof booking.fare === "number" && Number.isFinite(booking.fare) && booking.fare > 0 ? booking.fare : routePrice;
  const seats = booking.seats || 1;
  const farePaid = booking.fareStatus === "paid" || booking.fareStatus === "cash_collected";
  const fee = booking.bookingFeeStatus === "paid" ? booking.bookingFeeAmount ?? 0 : 0;

  return {
    ticketRevenue: farePaid ? seats * ticketPrice : 0,
    bookingFee: fee,
    total: (farePaid ? seats * ticketPrice : 0) + fee,
  };
}
