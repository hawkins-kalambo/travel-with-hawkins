import assert from "node:assert/strict";
import test, { mock } from "node:test";

let authResult: unknown;

mock.module("@/lib/operatorAuth", {
  exports: {
    requireOperatorUser: async () => authResult,
  },
});

mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: {} },
});

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
