import type { BookingRecord } from "@/lib/bookingTypes";
import { calcBookingRevenue } from "@/lib/bookingRevenue";

function quote(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

// routesStr is optional so callers without settings handy still get a valid
// CSV — the three revenue columns just fall back to whatever `fare`/
// `bookingFeeAmount` is already stored on each row (no route-price fallback
// applied) rather than failing to export.
export function createCsvFromBookings(rows: BookingRecord[], routesStr?: string | Record<string, unknown>) {
  const header = [
    "Booking ID",
    "Trip ID",
    "Student Name",
    "Student ID",
    "Phone",
    "Destination",
    "Direction",
    "Journey Origin",
    "Journey Destination",
    "Home District",
    "Pickup",
    "Travel Date",
    "Seats",
    "Journey Status",
    "Booking Fee Status",
    "Booking Fee Collected (MWK)",
    "Fare Status",
    "Fare Payment Method",
    "Fare Collected (MWK)",
    "Total Collected (MWK)",
  ];

  const lines = rows.map((row) => {
    const revenue = calcBookingRevenue(row, routesStr);
    return [
      quote(String(row.bookingId ?? "")),
      quote(String(row.tripId ?? "")),
      quote(String(row.name ?? "")),
      quote(String(row.studentId ?? "")),
      quote(String(row.phone ?? "")),
      quote(String(row.destination ?? "")),
      quote(String(row.journeyDirection ?? "")),
      quote(String(row.journeyOrigin ?? "")),
      quote(String(row.journeyDestination ?? "")),
      quote(String(row.homeDistrict ?? "")),
      quote(String(row.pickup ?? "")),
      quote(String(row.travelDate ?? "")),
      quote(String(row.seats ?? 1)),
      quote(String(row.status ?? "")),
      quote(String(row.bookingFeeStatus ?? "")),
      quote(String(revenue.bookingFee)),
      quote(String(row.fareStatus ?? "")),
      quote(String(row.farePaymentMethod ?? "")),
      quote(String(revenue.ticketRevenue)),
      quote(String(revenue.total)),
    ].join(",");
  });

  return [header.join(","), ...lines].join("\r\n");
}
