import test from "node:test";
import assert from "node:assert/strict";

import { normalizeBookingRecord, toSupabaseBookingPayload } from "./bookingUtils.ts";

test("normalizeBookingRecord round-trips operator_id and service_type from a DB row", () => {
  const normalized = normalizeBookingRecord({
    booking_id: "BK-1",
    operator_id: "op-123",
    service_type: "intercity",
  });

  assert.equal(normalized.operatorId, "op-123");
  assert.equal(normalized.serviceType, "intercity");
});

test("normalizeBookingRecord round-trips operator_id and service_type from a camelCase payload", () => {
  const normalized = normalizeBookingRecord({
    bookingId: "BK-1",
    operatorId: "op-123",
    serviceType: "intercity",
  });

  assert.equal(normalized.operatorId, "op-123");
  assert.equal(normalized.serviceType, "intercity");
});

test("toSupabaseBookingPayload carries operator_id through and defaults service_type to intercity", () => {
  const payload = toSupabaseBookingPayload({ operatorId: "op-123" }, "BK-1", "TRIP-1");

  assert.equal(payload.operator_id, "op-123");
  assert.equal(payload.service_type, "intercity");
});

test("toSupabaseBookingPayload has no operator_id when none was resolved, rather than an empty string", () => {
  const payload = toSupabaseBookingPayload({}, "BK-1", "TRIP-1");

  assert.equal(payload.operator_id, undefined);
});
