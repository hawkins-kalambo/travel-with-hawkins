import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Guards against an auth-check regression: if someone removes or weakens
// the requireOperatorUser() call, these tests should fail.

let authResult: unknown;

mock.module("@/lib/operatorAuth", {
  exports: {
    requireOperatorUser: async () => authResult,
  },
});

mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: {} },
});

const { GET } = await import("./route.ts");

function makeGetRequest() {
  return new Request("https://example.com/api/operators/me") as unknown as Parameters<typeof GET>[0];
}

test("GET returns 401 when the caller is not authenticated", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await GET(makeGetRequest());
  assert.equal(res.status, 401);
});

test("GET returns 403 for an authenticated user with no active operator membership", async () => {
  authResult = { authorized: false, error: "Operator access required", status: 403 };
  const res = await GET(makeGetRequest());
  assert.equal(res.status, 403);
});
