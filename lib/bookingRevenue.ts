import type { BookingRecord } from "@/lib/bookingTypes";

export type BookingRevenue = { ticketRevenue: number; bookingFee: number; total: number };

// Single source of truth for "how much has actually been collected on this
// booking" — used by the admin dashboard's revenue tiles, the Students CRM
// spend totals, and the Reports summary/exports. Revenue only counts what's
// actually marked paid (bookingFeeStatus/fareStatus), never the nominal
// fare/fee amount regardless of payment state.
//
// ticketPrice relies on `booking.fare` alone, never a guessed fallback:
// record_manual_fare_payment() (db/migrations/2026_08_07_manual_fare_and_receipt_delivery.sql)
// has always required fare > 0 before a booking can be marked
// paid/cash_collected, so any booking counted as farePaid below is
// guaranteed to already carry a real fare.
export function calcBookingRevenue(
  booking: Pick<BookingRecord, "seats" | "fare" | "bookingFeeAmount" | "bookingFeeStatus" | "fareStatus">
): BookingRevenue {
  const ticketPrice = typeof booking.fare === "number" && Number.isFinite(booking.fare) && booking.fare > 0 ? booking.fare : 0;
  const seats = booking.seats || 1;
  const farePaid = booking.fareStatus === "paid" || booking.fareStatus === "cash_collected";
  const fee = booking.bookingFeeStatus === "paid" ? booking.bookingFeeAmount ?? 0 : 0;

  return {
    ticketRevenue: farePaid ? seats * ticketPrice : 0,
    bookingFee: fee,
    total: (farePaid ? seats * ticketPrice : 0) + fee,
  };
}
