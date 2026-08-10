import assert from "node:assert/strict";
import test, { mock } from "node:test";

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

function makeGetRequest(operatorId = "op-1") {
  return new Request(`https://example.com/api/admin/operators/fleet?operatorId=${operatorId}`) as unknown as Parameters<typeof GET>[0];
}

function makePatchRequest(body: Record<string, unknown> = { entityType: "vehicle", entityId: "veh-1", status: "active" }) {
  return new Request("https://example.com/api/admin/operators/fleet", {
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

test("GET returns 400 when operatorId is missing", async () => {
  authResult = { authorized: true, user: { id: "admin-1" }, role: "super_admin" };
  const res = await GET(new Request("https://example.com/api/admin/operators/fleet") as unknown as Parameters<typeof GET>[0]);
  assert.equal(res.status, 400);
});

test("PATCH returns 403 for an authenticated non-admin caller", async () => {
  authResult = { authorized: false, user: null, error: "Admin access required" };
  const res = await PATCH(makePatchRequest());
  assert.equal(res.status, 403);
});

test("PATCH returns 400 for an unsupported entityType", async () => {
  authResult = { authorized: true, user: { id: "admin-1" }, role: "super_admin" };
  const res = await PATCH(makePatchRequest({ entityType: "spaceship", entityId: "x-1", status: "active" }));
  assert.equal(res.status, 400);
});
