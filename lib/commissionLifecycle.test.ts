import test from "node:test";
import assert from "node:assert/strict";
import { shouldReverseCommission, isCommissionNeedingManualReview, buildCommissionReversalUpdate } from "./commissionLifecycle.ts";

test("a pending commission on a cancelled booking should be reversed", () => {
  assert.equal(shouldReverseCommission("Cancelled", "pending"), true);
});

test("an approved (but not yet paid) commission on a cancelled booking should be reversed", () => {
  assert.equal(shouldReverseCommission("Cancelled", "approved"), true);
});

test("a paid commission is never auto-reversed — real money may have moved", () => {
  assert.equal(shouldReverseCommission("Cancelled", "paid"), false);
});

test("a commission is left alone when the booking is not cancelled", () => {
  assert.equal(shouldReverseCommission("Confirmed", "pending"), false);
});

test("an already-cancelled commission is not re-reversed", () => {
  assert.equal(shouldReverseCommission("Cancelled", "cancelled"), false);
});

test("a paid commission on a cancelled booking is flagged for manual review", () => {
  assert.equal(isCommissionNeedingManualReview("Cancelled", "paid"), true);
});

test("a pending commission on a cancelled booking is NOT flagged for manual review (it's auto-reversed instead)", () => {
  assert.equal(isCommissionNeedingManualReview("Cancelled", "pending"), false);
});

test("buildCommissionReversalUpdate produces the expected shape", () => {
  const now = new Date("2026-08-01T12:00:00.000Z");
  const update = buildCommissionReversalUpdate("Booking cancelled", now);
  assert.deepEqual(update, {
    commission_status: "cancelled",
    cancelled_reason: "Booking cancelled",
    reversed_at: "2026-08-01T12:00:00.000Z",
  });
});
