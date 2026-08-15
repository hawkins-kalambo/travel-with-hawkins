import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Guards against an auth-check regression: if someone removes or weakens
// the requireAdminUser() call on either handler, these tests should fail.

let authResult: unknown;

mock.module("@/lib/supabaseServer", {
  exports: {
    requireAdminUser: async () => authResult,
  },
});

mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: {} },
});

mock.module("@/lib/operatorDocuments", {
  exports: {
    getSignedDocumentUrl: async () => "https://example.com/signed",
  },
});

const { GET, PATCH } = await import("./route.ts");

function makeGetRequest() {
  return new Request("https://example.com/api/admin/operators/documents") as unknown as Parameters<typeof GET>[0];
}

function makePatchRequest(body: Record<string, unknown> = { documentId: "doc-1", status: "verified" }) {
  return new Request("https://example.com/api/admin/operators/documents", {
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

test("PATCH returns 400 when rejecting without a reason", async () => {
  authResult = { authorized: true, user: { id: "admin-1" }, role: "super_admin" };
  const res = await PATCH(makePatchRequest({ documentId: "doc-1", status: "rejected" }));
  assert.equal(res.status, 400);
});

test("PATCH returns 400 for an unsupported status", async () => {
  authResult = { authorized: true, user: { id: "admin-1" }, role: "super_admin" };
  const res = await PATCH(makePatchRequest({ documentId: "doc-1", status: "not_a_real_status" }));
  assert.equal(res.status, 400);
});
