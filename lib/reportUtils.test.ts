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
