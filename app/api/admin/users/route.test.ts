import assert from "node:assert/strict";
import test, { mock } from "node:test";

// manageUsers is granted only to super_admin (lib/permissions.ts) — these
// tests exercise the REAL hasPermission()/normalizeAppRole() logic rather
// than faking it, since they're pure functions with no reason to mock.

let authResult: { user: { id: string } | null; error: unknown };
let role: string;

mock.module("@/lib/supabaseServer", {
  exports: {
    requireAuthenticatedUser: async () => authResult,
    resolveAdminRole: async () => role,
    escapeLikePattern: (value: string) => value,
  },
});

mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: {} },
});

const { GET, PATCH } = await import("./route.ts");

function makeGetRequest() {
  return new Request("https://example.com/api/admin/users") as unknown as Parameters<typeof GET>[0];
}

function makePatchRequest(body: Record<string, unknown>) {
  return new Request("https://example.com/api/admin/users", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof PATCH>[0];
}

test("GET returns 401 when the caller is not authenticated", async () => {
  authResult = { user: null, error: new Error("Unauthenticated") };
  role = "unknown";
  const res = await GET(makeGetRequest());
  assert.equal(res.status, 401);
});

test("GET returns 403 for an authenticated caller who is not super_admin", async () => {
  authResult = { user: { id: "u-1" }, error: null };
  role = "admin";
  const res = await GET(makeGetRequest());
  assert.equal(res.status, 403);
});

test("PATCH returns 401 when the caller is not authenticated", async () => {
  authResult = { user: null, error: new Error("Unauthenticated") };
  role = "unknown";
  const res = await PATCH(makePatchRequest({ targetId: "u-2", role: "admin" }));
  assert.equal(res.status, 401);
});

test("PATCH returns 403 for an authenticated caller who is not super_admin", async () => {
  authResult = { user: { id: "u-1" }, error: null };
  role = "university_admin";
  const res = await PATCH(makePatchRequest({ targetId: "u-2", role: "admin" }));
  assert.equal(res.status, 403);
});

test("PATCH returns 400 for a super_admin caller when targetId or role is missing", async () => {
  authResult = { user: { id: "u-1" }, error: null };
  role = "super_admin";
  const res = await PATCH(makePatchRequest({ targetId: "u-2" }));
  assert.equal(res.status, 400);
});
