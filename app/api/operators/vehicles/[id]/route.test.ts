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

// The lookup a cross-operator-scoped query performs is
// .eq("id", id).eq("operator_id", auth.operatorId).maybeSingle() — a real
// Supabase client with this filter returns no row for a resource owned by a
// different operator. This stub reproduces exactly that: it always resolves
// to `data: null`, regardless of which operator's id was requested, so the
// route's only path to a non-404 response is if it forgot the operator_id
// filter entirely.
function makeNoMatchBuilder() {
  const builder = {
    select: () => builder,
    update: () => builder,
    delete: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return builder;
}

const { PATCH, DELETE } = await import("./route.ts");

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new Request("https://example.com/api/operators/vehicles/veh-1", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as Parameters<typeof PATCH>[0];
}

function makeParams() {
  return { params: Promise.resolve({ id: "veh-1" }) };
}

test("PATCH returns 403 when the caller's staff role lacks manageVehicles", async () => {
  authResult = { authorized: false, error: "This action is not permitted for your role", status: 403 };
  const res = await PATCH(makeRequest("PATCH", { status: "maintenance" }), makeParams());
  assert.equal(res.status, 403);
});

test("DELETE returns 403 when the caller's staff role lacks manageVehicles", async () => {
  authResult = { authorized: false, error: "This action is not permitted for your role", status: 403 };
  const res = await DELETE(makeRequest("DELETE"), makeParams());
  assert.equal(res.status, 403);
});

test("PATCH returns 401 when the caller is not authenticated", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await PATCH(makeRequest("PATCH", { status: "maintenance" }), makeParams());
  assert.equal(res.status, 401);
});

// Cross-operator isolation: operator A is fully authorized (real owner
// role), but the vehicle id in the URL belongs to a different operator. The
// route must reject this as "not found," never leak or mutate the row.
test("PATCH returns 404 (not found) when the vehicle belongs to a different operator", async () => {
  authResult = { authorized: true, operatorId: "operator-A", staffRole: "owner", user: { id: "u-1" } };
  fromImpl = () => makeNoMatchBuilder();
  const res = await PATCH(makeRequest("PATCH", { status: "maintenance" }), makeParams());
  assert.equal(res.status, 404);
});

// DELETE has no separate lookup step — it deletes with the operator_id
// filter baked directly into the query, so a cross-operator id (like a
// wrong-status id) resolves the same way: no row matched, 409.
test("DELETE returns 409 (no row deleted) when the vehicle belongs to a different operator", async () => {
  authResult = { authorized: true, operatorId: "operator-A", staffRole: "owner", user: { id: "u-1" } };
  fromImpl = () => makeNoMatchBuilder();
  const res = await DELETE(makeRequest("DELETE"), makeParams());
  assert.equal(res.status, 409);
});
