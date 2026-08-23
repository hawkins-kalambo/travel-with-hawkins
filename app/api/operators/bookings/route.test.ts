import assert from "node:assert/strict";
import test, { mock } from "node:test";

let authResult: unknown;
let eqCalls: Array<[string, unknown]> = [];
let rows: Record<string, unknown>[] = [];

mock.module("@/lib/operatorAuth", {
  exports: {
    requireOperatorUser: async () => authResult,
  },
});

function makeBookingsBuilder() {
  const result = { data: rows, error: null };
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return builder;
    },
    order: () => builder,
    then: (resolve: (value: typeof result) => void) => resolve(result),
  };
  return builder;
}

mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: { from: () => makeBookingsBuilder() } },
});

const { GET } = await import("./route.ts");

function makeRequest() {
  return new Request("https://example.com/api/operators/bookings") as unknown as Parameters<typeof GET>[0];
}

test.beforeEach(() => {
  eqCalls = [];
  rows = [];
});

test("GET returns 401 when the caller is not authenticated", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await GET(makeRequest());
  assert.equal(res.status, 401);
});

test("GET returns 403 when the caller's staff role lacks viewBookings", async () => {
  authResult = { authorized: false, error: "This action is not permitted for your role", status: 403 };
  const res = await GET(makeRequest());
  assert.equal(res.status, 403);
});

// D14's whole point is that an operator only ever sees their OWN bookings
// — this is the actual isolation mechanism, so it's worth asserting the
// query is filtered by the caller's own operatorId rather than trusting
// the handler's intent.
test("GET filters the query by the caller's own operatorId", async () => {
  authResult = { authorized: true, operatorId: "operator-A", staffRole: "owner", user: { id: "u-1" } };
  rows = [{ booking_id: "BK-1", operator_id: "operator-A", name: "Test Customer", status: "Booked" }];
  const res = await GET(makeRequest());
  assert.equal(res.status, 200);
  assert.deepEqual(eqCalls, [["operator_id", "operator-A"]]);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.bookings.length, 1);
  assert.equal(body.bookings[0].bookingId, "BK-1");
});
