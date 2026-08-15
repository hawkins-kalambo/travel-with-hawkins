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

const { PATCH, DELETE } = await import("./route.ts");

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new Request("https://example.com/api/operators/drivers/drv-1", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as Parameters<typeof PATCH>[0];
}

function makeParams() {
  return { params: Promise.resolve({ id: "drv-1" }) };
}

test("PATCH returns 403 when the caller's staff role lacks manageDrivers", async () => {
  authResult = { authorized: false, error: "This action is not permitted for your role", status: 403 };
  const res = await PATCH(makeRequest("PATCH", { status: "inactive" }), makeParams());
  assert.equal(res.status, 403);
});

test("DELETE returns 401 when the caller is not authenticated", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await DELETE(makeRequest("DELETE"), makeParams());
  assert.equal(res.status, 401);
});
