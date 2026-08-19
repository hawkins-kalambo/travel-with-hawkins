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

// A real .eq("operator_id", ...) filter returns no row for a resource
// owned by a different operator — this stub reproduces exactly that.
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
  return new Request("https://example.com/api/operators/taxi-fares/fare-1", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as Parameters<typeof PATCH>[0];
}

function makeParams() {
  return { params: Promise.resolve({ id: "fare-1" }) };
}

test("PATCH returns 403 when the caller's staff role lacks manageRoutes", async () => {
  authResult = { authorized: false, error: "This action is not permitted for your role", status: 403 };
  const res = await PATCH(makeRequest("PATCH", { status: "inactive" }), makeParams());
  assert.equal(res.status, 403);
});

test("DELETE returns 401 when the caller is not authenticated", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await DELETE(makeRequest("DELETE"), makeParams());
  assert.equal(res.status, 401);
});

test("PATCH returns 404 (not found) when the taxi fare belongs to a different operator", async () => {
  authResult = { authorized: true, operatorId: "operator-A", staffRole: "owner", user: { id: "u-1" } };
  fromImpl = () => makeNoMatchBuilder();
  const res = await PATCH(makeRequest("PATCH", { status: "inactive" }), makeParams());
  assert.equal(res.status, 404);
});

test("DELETE returns 404 (not found) when the taxi fare belongs to a different operator", async () => {
  authResult = { authorized: true, operatorId: "operator-A", staffRole: "owner", user: { id: "u-1" } };
  fromImpl = () => makeNoMatchBuilder();
  const res = await DELETE(makeRequest("DELETE"), makeParams());
  assert.equal(res.status, 404);
});
