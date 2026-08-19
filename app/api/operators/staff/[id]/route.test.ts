import assert from "node:assert/strict";
import test, { mock } from "node:test";

let authResult: unknown;
let fromImpl: (table: string) => unknown = () => ({});

mock.module("@/lib/operatorAuth", {
  exports: {
    requireOperatorUser: async () => authResult,
  },
});

mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: { from: (table: string) => fromImpl(table) } },
});

// See app/api/operators/vehicles/[id]/route.test.ts for why this always
// resolves to no row: it reproduces what a real .eq("operator_id", ...)
// filter does when the id belongs to a different operator.
function makeNoMatchBuilder() {
  const builder = {
    select: () => builder,
    update: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return builder;
}

mock.module("@/lib/operatorStaff", {
  exports: {
    countActiveOwners: async () => 1,
  },
});

const { PATCH } = await import("./route.ts");

function makeRequest(body: Record<string, unknown>) {
  return new Request("https://example.com/api/operators/staff/mem-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof PATCH>[0];
}

function makeParams() {
  return { params: Promise.resolve({ id: "mem-1" }) };
}

test("PATCH returns 401 when the caller is not authenticated", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await PATCH(makeRequest({ status: "suspended" }), makeParams());
  assert.equal(res.status, 401);
});

test("PATCH returns 403 when the caller's staff role lacks manageStaff", async () => {
  authResult = { authorized: false, error: "This action is not permitted for your role", status: 403 };
  const res = await PATCH(makeRequest({ status: "suspended" }), makeParams());
  assert.equal(res.status, 403);
});

test("PATCH returns 404 (not found) when the staff member belongs to a different operator", async () => {
  authResult = { authorized: true, operatorId: "operator-A", staffRole: "owner", user: { id: "u-1" } };
  fromImpl = () => makeNoMatchBuilder();
  const res = await PATCH(makeRequest({ status: "suspended" }), makeParams());
  assert.equal(res.status, 404);
});
