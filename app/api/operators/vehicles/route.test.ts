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

const { GET, POST } = await import("./route.ts");

function makeGetRequest() {
  return new Request("https://example.com/api/operators/vehicles") as unknown as Parameters<typeof GET>[0];
}

function makePostRequest(body: Record<string, unknown>) {
  return new Request("https://example.com/api/operators/vehicles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

test("GET returns 401 when the caller is not authenticated", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await GET(makeGetRequest());
  assert.equal(res.status, 401);
});

test("POST returns 403 when the caller's staff role lacks manageVehicles", async () => {
  authResult = { authorized: false, error: "This action is not permitted for your role", status: 403 };
  const res = await POST(makePostRequest({ serviceType: "intercity", registrationNumber: "ABC 123" }));
  assert.equal(res.status, 403);
});

test("POST returns 400 for an unsupported serviceType even when authorized", async () => {
  authResult = { authorized: true, operatorId: "op-1", staffRole: "owner", user: { id: "u-1" } };
  const res = await POST(makePostRequest({ serviceType: "spaceship", registrationNumber: "ABC 123" }));
  assert.equal(res.status, 400);
});

test("POST returns 400 when registrationNumber is missing", async () => {
  authResult = { authorized: true, operatorId: "op-1", staffRole: "owner", user: { id: "u-1" } };
  const res = await POST(makePostRequest({ serviceType: "intercity" }));
  assert.equal(res.status, 400);
});
