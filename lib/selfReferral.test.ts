import test from "node:test";
import assert from "node:assert/strict";
import { isSelfReferral } from "./selfReferral.ts";

test("detects a self-referral by matching phone number, regardless of formatting", () => {
  // The booking phone is already E.164-normalized by validateBookingInput;
  // the ambassador's stored phone may not be.
  assert.equal(isSelfReferral("+265991234567", undefined, "099 123 4567", null), true);
  assert.equal(isSelfReferral("+265991234567", undefined, "0991234567", null), true);
});

test("detects a self-referral by matching email, case-insensitively", () => {
  assert.equal(isSelfReferral("+265888000000", "Ted@Example.com", "0765554433", "ted@example.com"), true);
});

test("does not flag a booking from a genuinely different customer", () => {
  assert.equal(isSelfReferral("+265991234567", "customer@example.com", "0765554433", "ambassador@example.com"), false);
});

test("does not false-positive when the ambassador has no phone/email on file", () => {
  assert.equal(isSelfReferral("+265991234567", "customer@example.com", null, null), false);
});

test("does not false-positive when the booking has no email and phones differ", () => {
  assert.equal(isSelfReferral("+265991234567", undefined, "0765554433", "ambassador@example.com"), false);
});
