import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Guards against an auth-check regression: if someone removes or weakens
// the requireAdminUser() call, these tests should fail. Mocks the auth
// resolver itself, same pattern as app/api/admin/bookings/route.test.ts.

let authResult: unknown;

mock.module("@/lib/supabaseServer", {
  exports: {
    requireAdminUser: async () => authResult,
  },
});

mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: {} },
});

const { GET, PATCH } = await import("./route.ts");

function makeGetRequest() {
  return new Request("https://example.com/api/admin/operators") as unknown as Parameters<typeof GET>[0];
}

function makePatchRequest(body: Record<string, unknown> = { operatorId: "op-1", applicationStatus: "approved" }) {
  return new Request("https://example.com/api/admin/operators", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof PATCH>[0];
}

test("GET returns 403 when the caller is not authenticated", async () => {
  authResult = { authorized: false, user: null, error: "Authentication required" };
  const res = await GET(makeGetRequest());
  assert.equal(res.status, 403);
});

test("GET returns 403 for an authenticated non-admin caller", async () => {
  authResult = { authorized: false, user: null, error: "Admin access required" };
  const res = await GET(makeGetRequest());
  assert.equal(res.status, 403);
});

test("PATCH returns 403 when the caller is not authenticated", async () => {
  authResult = { authorized: false, user: null, error: "Authentication required" };
  const res = await PATCH(makePatchRequest());
  assert.equal(res.status, 403);
});

test("PATCH returns 403 for an authenticated non-admin caller", async () => {
  authResult = { authorized: false, user: null, error: "Admin access required" };
  const res = await PATCH(makePatchRequest());
  assert.equal(res.status, 403);
});

test("PATCH returns 400 when neither applicationStatus nor status is provided", async () => {
  authResult = { authorized: true, user: { id: "admin-1" }, role: "super_admin" };
  const res = await PATCH(makePatchRequest({ operatorId: "op-1" }));
  assert.equal(res.status, 400);
});

test("PATCH returns 400 for an unsupported applicationStatus", async () => {
  authResult = { authorized: true, user: { id: "admin-1" }, role: "super_admin" };
  const res = await PATCH(makePatchRequest({ operatorId: "op-1", applicationStatus: "not_a_real_status" }));
  assert.equal(res.status, 400);
});

test("PATCH returns 400 when suspending without a suspension reason", async () => {
  authResult = { authorized: true, user: { id: "admin-1" }, role: "super_admin" };
  const res = await PATCH(makePatchRequest({ operatorId: "op-1", status: "suspended" }));
  assert.equal(res.status, 400);
});
