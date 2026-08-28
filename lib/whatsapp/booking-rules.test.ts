import assert from "node:assert/strict";
import test from "node:test";
import {
  FINAL_CUTOFF_HOURS, STANDARD_DEADLINE_DAYS,
  departureEpochMs, formatMalawiDateTime, planBookingDeadline,
} from "./booking-rules.ts";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const MIN = 60_000;
const NOW = Date.parse("2026-09-01T09:00:00+02:00");

test("planBookingDeadline: departure within 24h is not bookable", () => {
  assert.deepEqual(planBookingDeadline(NOW, NOW + 23 * HOUR), { kind: "too_soon" });
  assert.deepEqual(planBookingDeadline(NOW, NOW + FINAL_CUTOFF_HOURS * HOUR - 1), { kind: "too_soon" });
});

test("planBookingDeadline: 7+ days out gives a 7-day fee deadline", () => {
  const plan = planBookingDeadline(NOW, NOW + 20 * DAY);
  assert.equal(plan.kind, "standard");
  if (plan.kind === "standard") assert.equal(plan.deadlineMs, NOW + STANDARD_DEADLINE_DAYS * DAY);
});

test("planBookingDeadline: the 7-day deadline never lands inside the 24h pre-departure cutoff", () => {
  // Departure 7 days + 6 hours out: now()+7d would be only 6h before departure.
  const departure = NOW + 7 * DAY + 6 * HOUR;
  const plan = planBookingDeadline(NOW, departure);
  assert.equal(plan.kind, "standard");
  if (plan.kind === "standard") assert.equal(plan.deadlineMs, departure - FINAL_CUTOFF_HOURS * HOUR);
});

test("planBookingDeadline: under 7 days (but >= 24h) is a 15-minute hold", () => {
  const plan = planBookingDeadline(NOW, NOW + 3 * DAY);
  assert.equal(plan.kind, "short_notice");
  if (plan.kind === "short_notice") assert.equal(plan.deadlineMs, NOW + 15 * MIN);
});

test("planBookingDeadline: exactly 7 days out routes to immediate payment (short-notice), not a hold to departure", () => {
  const plan = planBookingDeadline(NOW, NOW + 7 * DAY - 1);
  assert.equal(plan.kind, "short_notice");
});

test("departureEpochMs: reads the wall-clock time as Malawi (UTC+2)", () => {
  assert.equal(departureEpochMs("2026-09-10", "07:00:00"), Date.parse("2026-09-10T07:00:00+02:00"));
  // no time -> midday default
  assert.equal(departureEpochMs("2026-09-10", null), Date.parse("2026-09-10T12:00:00+02:00"));
  assert.equal(departureEpochMs("2026-09-10", "07:30"), Date.parse("2026-09-10T07:30:00+02:00"));
});

test("formatMalawiDateTime: renders a Malawi-local, human-readable stamp", () => {
  const out = formatMalawiDateTime(Date.parse("2026-09-10T07:00:00+02:00"));
  assert.match(out, /\b10 \w+ 2026\b/);
  assert.match(out, /07:00/);
  assert.match(out, /Malawi time/);
});

test("formatMalawiDateTime: tolerates a bad input", () => {
  assert.equal(typeof formatMalawiDateTime(Number.NaN), "string");
});
