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
    "Pickup",
    "Travel Date",
    "Seats",
    "Journey Status",
    "Payment Status",
  ];

  const lines = rows.map((row) => {
    return [
      quote(String(row.bookingId ?? "")),
      quote(String(row.tripId ?? "")),
      quote(String(row.name ?? "")),
      quote(String(row.studentId ?? "")),
      quote(String(row.phone ?? "")),
      quote(String(row.destination ?? "")),
      quote(String(row.pickup ?? "")),
      quote(String(row.travelDate ?? "")),
      quote(String(row.seats ?? 1)),
      quote(String(row.status ?? "")),
      quote(String(row.paymentStatus ?? "")),
    ].join(",");
  });

  return [header.join(","), ...lines].join("\r\n");
}
