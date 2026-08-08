import type { BookingRecord } from "@/lib/bookingTypes";

function quote(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function createCsvFromBookings(rows: BookingRecord[]) {
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
    "Fare Status",
    "Fare Payment Method",
  ];

  const lines = rows.map((row) => {
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
      quote(String(row.fareStatus ?? "")),
      quote(String(row.farePaymentMethod ?? "")),
    ].join(",");
  });

  return [header.join(","), ...lines].join("\r\n");
}
