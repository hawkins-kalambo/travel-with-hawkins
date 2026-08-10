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
    inviteOperatorStaff: async () => ({ success: true, userId: "u-1", temporaryPassword: "TWHOp@abc12345" }),
  },
});

const { GET, POST } = await import("./route.ts");

function makeGetRequest() {
  return new Request("https://example.com/api/operators/staff") as unknown as Parameters<typeof GET>[0];
}

function makePostRequest(body: Record<string, unknown>) {
  return new Request("https://example.com/api/operators/staff", {
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

test("POST returns 403 when the caller's staff role lacks manageStaff", async () => {
  authResult = { authorized: false, error: "This action is not permitted for your role", status: 403 };
  const res = await POST(makePostRequest({ fullName: "Jane", email: "jane@example.com", phone: "0999000000", staffRole: "dispatcher" }));
  assert.equal(res.status, 403);
});

test("POST returns 400 for an unsupported staffRole", async () => {
  authResult = { authorized: true, operatorId: "op-1", staffRole: "manager", user: { id: "u-owner" } };
  const res = await POST(makePostRequest({ fullName: "Jane", email: "jane@example.com", phone: "0999000000", staffRole: "spaceship" }));
  assert.equal(res.status, 400);
});

test("POST returns 403 when a manager tries to grant the owner role", async () => {
  authResult = { authorized: true, operatorId: "op-1", staffRole: "manager", user: { id: "u-manager" } };
  const res = await POST(makePostRequest({ fullName: "Jane", email: "jane@example.com", phone: "0999000000", staffRole: "owner" }));
  assert.equal(res.status, 403);
});

test("POST succeeds when an owner grants the owner role", async () => {
  authResult = { authorized: true, operatorId: "op-1", staffRole: "owner", user: { id: "u-owner" } };
  const res = await POST(makePostRequest({ fullName: "Jane", email: "jane@example.com", phone: "0999000000", staffRole: "owner" }));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.temporaryPassword, "TWHOp@abc12345");
});
