import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTROLLER_SCHEMA_VERSION, SAFE_CONTROLLER_OUTPUT, parseControllerOutput,
} from "./schema.ts";

test("a well-formed object is passed through and stamped with the schema version", () => {
  const out = parseControllerOutput({
    language: "en", intent: "route_search", confidence: 0.92,
    entities: { origin: "Lilongwe", destination: "MZUNI", travelDate: "2026-09-01" },
    missingFields: [], requestedTool: "searchActiveRoutes",
    requiresConfirmation: false, requiresHuman: false, urgency: "normal",
  });
  assert.equal(out.schemaVersion, CONTROLLER_SCHEMA_VERSION);
  assert.equal(out.intent, "route_search");
  assert.equal(out.language, "en");
  assert.equal(out.confidence, 0.92);
  assert.deepEqual(out.entities, { origin: "Lilongwe", destination: "MZUNI", travelDate: "2026-09-01" });
  assert.equal(out.requestedTool, "searchActiveRoutes");
});

test("garbage in -> the safe default shape, never a throw", () => {
  for (const bad of [null, undefined, "not json", 42, [], { intent: 123 }]) {
    const out = parseControllerOutput(bad);
    assert.equal(out.intent, "unknown");
    assert.equal(out.requestedTool, null);
    assert.equal(out.schemaVersion, CONTROLLER_SCHEMA_VERSION);
  }
});

test("an unrecognised intent collapses to 'unknown'", () => {
  assert.equal(parseControllerOutput({ intent: "delete_everything", confidence: 0.9 }).intent, "unknown");
});

test("a requested tool that isn't a plain identifier is dropped", () => {
  assert.equal(parseControllerOutput({ intent: "route_search", confidence: 0.9, requestedTool: "http://evil/x" }).requestedTool, null);
  assert.equal(parseControllerOutput({ intent: "route_search", confidence: 0.9, requestedTool: "DROP TABLE routes" }).requestedTool, null);
  assert.equal(parseControllerOutput({ intent: "route_search", confidence: 0.9, requestedTool: "searchActiveRoutes" }).requestedTool, "searchActiveRoutes");
});

test("low confidence or unknown intent clears the requested tool", () => {
  assert.equal(parseControllerOutput({ intent: "route_search", confidence: 0.2, requestedTool: "searchActiveRoutes" }).requestedTool, null);
  assert.equal(parseControllerOutput({ intent: "unknown", confidence: 0.99, requestedTool: "searchActiveRoutes" }).requestedTool, null);
});

test("confidence is clamped to 0..1", () => {
  assert.equal(parseControllerOutput({ intent: "menu", confidence: 5 }).confidence, 1);
  assert.equal(parseControllerOutput({ intent: "menu", confidence: -2 }).confidence, 0);
  assert.equal(parseControllerOutput({ intent: "menu", confidence: "0.7" }).confidence, 0.7);
});

test("urgency 'urgent' forces requiresHuman", () => {
  const out = parseControllerOutput({ intent: "urgent_support", confidence: 0.9, urgency: "urgent" });
  assert.equal(out.urgency, "urgent");
  assert.equal(out.requiresHuman, true);
});

test("entities are capped, non-date travelDate is dropped, enums validated", () => {
  const out = parseControllerOutput({
    intent: "start_booking", confidence: 0.8,
    entities: {
      origin: "x".repeat(500), travelDate: "next friday",
      travellerType: "STUDENT", direction: "sideways", bookingId: "BK-1",
    },
  });
  assert.equal(out.entities.origin?.length, 80);
  assert.equal(out.entities.travelDate, undefined);
  assert.equal(out.entities.travellerType, "student");
  assert.equal(out.entities.direction, undefined);
  assert.equal(out.entities.bookingId, "BK-1");
});

test("snake_case keys from the model are accepted", () => {
  const out = parseControllerOutput({
    intent: "start_booking", confidence: 0.8,
    missing_fields: ["travelDate"], requested_tool: "createBookingDraft",
    requires_confirmation: true, requires_human: false,
    entities: { travel_date: "2026-09-01", booking_id: "BK-2" },
  });
  assert.deepEqual(out.missingFields, ["travelDate"]);
  assert.equal(out.requestedTool, "createBookingDraft");
  assert.equal(out.requiresConfirmation, true);
  assert.equal(out.entities.travelDate, "2026-09-01");
  assert.equal(out.entities.bookingId, "BK-2");
});

test("SAFE_CONTROLLER_OUTPUT is itself a valid, inert shape", () => {
  assert.equal(SAFE_CONTROLLER_OUTPUT.intent, "unknown");
  assert.equal(SAFE_CONTROLLER_OUTPUT.requestedTool, null);
  assert.equal(SAFE_CONTROLLER_OUTPUT.requiresHuman, false);
});
