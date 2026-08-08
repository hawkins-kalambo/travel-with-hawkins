import assert from "node:assert/strict";
import test from "node:test";

import {
  canRescheduleJourney,
  canTransitionJourneyStatus,
  getAllowedJourneyTransitions,
  parseFutureTravelDate,
  parseJourneyStatus,
} from "./bookingLifecycle.ts";

test("journey status parser accepts only supported normalized values", () => {
  assert.equal(parseJourneyStatus("confirmed"), "Confirmed");
  assert.equal(parseJourneyStatus("en route"), "Boarding");
  assert.equal(parseJourneyStatus("made-up"), null);
});

test("journey lifecycle permits the normal operational sequence", () => {
  assert.equal(canTransitionJourneyStatus("Booked", "Confirmed"), true);
  assert.equal(canTransitionJourneyStatus("Confirmed", "Boarding"), true);
  assert.equal(canTransitionJourneyStatus("Boarding", "Departed"), true);
  assert.equal(canTransitionJourneyStatus("Departed", "Arrived"), true);
  assert.equal(canTransitionJourneyStatus("Arrived", "Completed"), true);
});

test("journey lifecycle rejects skips and terminal-state changes", () => {
  assert.equal(canTransitionJourneyStatus("Booked", "Departed"), false);
  assert.equal(canTransitionJourneyStatus("Completed", "Cancelled"), false);
  assert.equal(canTransitionJourneyStatus("Cancelled", "Confirmed"), false);
});

test("cancellation is available only before departure", () => {
  assert.deepEqual(getAllowedJourneyTransitions("Booked"), ["Confirmed", "Cancelled"]);
  assert.deepEqual(getAllowedJourneyTransitions("Confirmed"), ["Boarding", "Cancelled"]);
  assert.deepEqual(getAllowedJourneyTransitions("Boarding"), ["Departed", "Cancelled"]);
  assert.equal(canTransitionJourneyStatus("Departed", "Cancelled"), false);
});

test("only pre-departure bookings can be rescheduled", () => {
  assert.equal(canRescheduleJourney("Booked"), true);
  assert.equal(canRescheduleJourney("Confirmed"), true);
  assert.equal(canRescheduleJourney("Boarding"), false);
  assert.equal(canRescheduleJourney("Cancelled"), false);
});

test("reschedule dates must be real ISO dates that are not in the past", () => {
  const today = new Date("2026-08-07T12:00:00.000Z");
  assert.equal(parseFutureTravelDate("2026-08-07", today), "2026-08-07");
  assert.equal(parseFutureTravelDate("2026-08-08", today), "2026-08-08");
  assert.equal(parseFutureTravelDate("2026-08-06", today), null);
  assert.equal(parseFutureTravelDate("2026-02-30", today), null);
  assert.equal(parseFutureTravelDate("07/08/2026", today), null);
});
