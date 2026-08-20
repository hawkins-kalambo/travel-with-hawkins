import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Guards the actual runtime mechanism behind every Phase 3 launch-safety
// kill switch (feature flags, operator pause): each check must reject
// BEFORE any database or RPC call happens. Every stub below throws on any
// access it doesn't expect, so an accidental DB/RPC call surfaces as a
// loud test failure rather than silently passing.

let flagState: Record<string, boolean> = {};

mock.module("@/lib/featureFlags", {
  exports: {
    isFeatureEnabled: async (key: string) => Boolean(flagState[key]),
  },
});

type RouteRow = Record<string, unknown> | null;
let routesRow: RouteRow = null;

// settings is the only table read before the branch dispatch (see
// app/api/bookings/route.ts's unconditional `.from("settings")...` call
// right after validation) — every test needs it to resolve. `routes` is
// only needed by the operator-pause tests below.
function makeSettingsBuilder() {
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: { booking_fee: 5000, max_seats: 14 }, error: null }),
  };
  return builder;
}

function makeRoutesBuilder() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: routesRow, error: null }),
  };
  return builder;
}

function fromImpl(table: string): unknown {
  if (table === "settings") return makeSettingsBuilder();
  if (table === "routes" && routesRow) return makeRoutesBuilder();
  throw new Error(`unexpected table access in this test: ${table}`);
}

mock.module("@/lib/supabaseAdmin", {
  exports: {
    supabaseAdmin: {
      from: (table: string) => fromImpl(table),
      rpc: (name: string) => {
        throw new Error(`unexpected rpc call in this test: ${name}`);
      },
    },
  },
});

const { POST } = await import("./route.ts");

function makeRequest(body: Record<string, unknown>) {
  return new Request("https://example.com/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

const SERVICE_UNAVAILABLE_MESSAGE = "This service is temporarily unavailable. Please try again later or contact support.";

const baseBody = {
  name: "Test User",
  phone: "0991234567",
  destination: "Somewhere",
  travelDate: "2026-09-01",
  seats: 1,
};

test.beforeEach(() => {
  flagState = {};
  routesRow = null;
});

test("POST rejects a car-hire booking with the customer-safe message when car_hire_enabled is off, before touching the database", async () => {
  const res = await POST(makeRequest({ ...baseBody, carHireListingId: "listing-1" }));
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.equal(body.error, SERVICE_UNAVAILABLE_MESSAGE);
});

test("POST rejects a taxi booking with the customer-safe message when taxi_enabled is off, before touching the database", async () => {
  const res = await POST(makeRequest({ ...baseBody, taxiFareId: "fare-1" }));
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.equal(body.error, SERVICE_UNAVAILABLE_MESSAGE);
});

test("POST rejects a structured-route booking with the customer-safe message when public_intercity_enabled is off, before touching the database", async () => {
  const res = await POST(makeRequest({ ...baseBody, routeId: "route-1" }));
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.equal(body.error, SERVICE_UNAVAILABLE_MESSAGE);
});

test("POST rejects a university-selected booking with the customer-safe message when student_booking_enabled is off, before touching the database", async () => {
  const res = await POST(makeRequest({ ...baseBody, universityId: "uni-1" }));
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.equal(body.error, SERVICE_UNAVAILABLE_MESSAGE);
});

// This is the branch that had ZERO gating before Step 1's fix — no `else`
// existed at all, so a pure free-text/custom-destination booking (no
// routeId/taxiFareId/carHireListingId/universityId) sailed straight past
// every other check. Regression-protects that fix specifically.
test("POST rejects a free-text/custom-destination booking with the customer-safe message when student_booking_enabled is off, before touching the database", async () => {
  const res = await POST(makeRequest({ ...baseBody }));
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.equal(body.error, SERVICE_UNAVAILABLE_MESSAGE);
});

// The actual bug Step 1 found and fixed: pausing an operator previously
// blocked their taxi/car-hire bookings but NOT their intercity routes,
// because this branch never joined or checked operator status at all.
test("POST rejects a public-destination route booking when the owning operator is paused, before reaching capacity/dedupe RPCs", async () => {
  flagState.public_intercity_enabled = true;
  routesRow = {
    id: "route-1",
    fare: 5000,
    status: "active",
    operator_id: "op-1",
    university_id: null,
    destination_label: "Test Destination",
    pickup_point_id: null,
    district_pickup_point_id: null,
    origin_district: "Lilongwe",
    direction: "to_university",
    commission_amount: 0,
    commission_type: "fixed",
    operator: { status: "paused" },
    university: null,
    pickupPoint: null,
    districtPickupPoint: null,
  };

  const res = await POST(makeRequest({ ...baseBody, routeId: "route-1", journeyDirection: "to_university" }));
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error, "The selected route is not currently available.");
});

test("POST rejects a university-anchored route booking when the owning operator is paused, before reaching capacity/dedupe RPCs", async () => {
  flagState.public_intercity_enabled = true;
  routesRow = {
    id: "route-2",
    fare: 5000,
    status: "active",
    operator_id: "op-1",
    university_id: "uni-1",
    destination_label: null,
    pickup_point_id: "pickup-1",
    district_pickup_point_id: "district-pickup-1",
    origin_district: "Lilongwe",
    direction: "to_university",
    commission_amount: 0,
    commission_type: "fixed",
    operator: { status: "paused" },
    university: { name: "Test University", status: "active" },
    pickupPoint: { label: "Main Gate", status: "active" },
    districtPickupPoint: { district: "Lilongwe", label: "Town Centre", status: "active" },
  };

  const res = await POST(makeRequest({ ...baseBody, routeId: "route-2", journeyDirection: "to_university" }));
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error, "The selected route is not currently available.");
});
