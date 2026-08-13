import assert from "node:assert/strict";
import test from "node:test";

import { parseReportFilters, summarizeReportRows } from "./reportUtils.ts";

test("report filters use split booking-fee and fare statuses", () => {
  const filters = parseReportFilters(new URLSearchParams("bookingFeeStatus=paid&fareStatus=cash_collected"));
  assert.equal(filters.bookingFeeStatus, "paid");
  assert.equal(filters.fareStatus, "cash_collected");
  assert.equal("paymentStatus" in filters, false);
});
test("report summaries use actual fee and fare settlement fields", () => {
  const summary = summarizeReportRows([
    { bookingId: "A", tripId: "T1", seats: 2, bookingFeeStatus: "paid", fareStatus: "cash_collected", status: "Confirmed" },
    { bookingId: "B", tripId: "T1", seats: 1, bookingFeeStatus: "unpaid", fareStatus: "unpaid", status: "Booked" },
    { bookingId: "C", tripId: "T2", seats: 1, bookingFeeStatus: "paid", fareStatus: "paid", status: "Completed" },
  ]);

  assert.equal(summary.bookingFeePaid, 2);
  assert.equal(summary.fareSettled, 2);
  assert.equal(summary.totalTrips, 2);
  assert.equal(summary.totalSeats, 4);
});

test("report summaries compute revenue from actually-paid amounts, never the nominal fare", () => {
  const summary = summarizeReportRows(
    [
      // Fee paid (2000), fare paid using stored `fare` (5000 x 2 seats).
      { bookingId: "A", tripId: "T1", seats: 2, fare: 5000, bookingFeeAmount: 2000, bookingFeeStatus: "paid", fareStatus: "paid", status: "Confirmed" },
      // Fee unpaid (shouldn't count as revenue, but should count as outstanding), fare unpaid falling back to the route price.
      { bookingId: "B", tripId: "T1", seats: 1, destination: "Mzuzu - Lilongwe", bookingFeeAmount: 2000, bookingFeeStatus: "unpaid", fareStatus: "unpaid", status: "Booked" },
    ],
    "Mzuzu - Lilongwe: 5000"
  );

  assert.equal(summary.bookingFeeRevenue, 2000);
  assert.equal(summary.fareRevenue, 10000);
  assert.equal(summary.totalRevenue, 12000);
  assert.equal(summary.outstandingBookingFee, 2000);
  assert.equal(summary.outstandingFare, 5000);
});
