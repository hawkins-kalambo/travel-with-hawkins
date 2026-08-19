import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Guards against an auth-check regression: if someone removes or weakens
// the requireOperatorUser() "manageDocuments" permission check on POST, or
// the plain authentication check on GET, these tests should fail.

let authResult: unknown;
let fromImpl: (table: string) => unknown = () => ({});

mock.module("@/lib/operatorAuth", {
  exports: {
    requireOperatorUser: async () => authResult,
  },
});

mock.module("@/lib/operatorDocuments", {
  exports: {
    uploadOperatorDocument: async () => ({ success: true, documentId: "doc-1" }),
  },
});

mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: { from: (table: string) => fromImpl(table) } },
});

// subjectBelongsToOperator() runs .eq("id", subjectId).eq("operator_id",
// operatorId).maybeSingle() against vehicles/drivers — a real Supabase
// client returns no row when the vehicle/driver belongs to a different
// operator. This stub reproduces exactly that.
function makeNoMatchBuilder() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return builder;
}

const { GET, POST } = await import("./route.ts");

function makeGetRequest() {
  return new Request("https://example.com/api/operators/documents") as unknown as Parameters<typeof GET>[0];
}

function makePostRequest(body: Record<string, unknown>) {
  return new Request("https://example.com/api/operators/documents", {
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

test("POST returns 403 when the caller's staff role lacks manageDocuments", async () => {
  authResult = { authorized: false, error: "This action is not permitted for your role", status: 403 };
  const res = await POST(makePostRequest({ subjectType: "operator", subjectId: "op-1", documentType: "insurance", file: "data:application/pdf;base64,AAAA" }));
  assert.equal(res.status, 403);
});

test("POST returns 400 for an unsupported subjectType even when authorized", async () => {
  authResult = { authorized: true, operatorId: "op-1", staffRole: "owner", user: { id: "u-1" } };
  const res = await POST(makePostRequest({ subjectType: "spaceship", subjectId: "op-1", documentType: "insurance", file: "data:application/pdf;base64,AAAA" }));
  assert.equal(res.status, 400);
});

test("POST returns 400 when required fields are missing", async () => {
  authResult = { authorized: true, operatorId: "op-1", staffRole: "owner", user: { id: "u-1" } };
  const res = await POST(makePostRequest({ subjectType: "operator" }));
  assert.equal(res.status, 400);
});

// Cross-operator isolation: operator A is authorized, but attaches a
// document to a vehicle id that belongs to a different operator.
test("POST returns 403 when subjectId (vehicle) belongs to a different operator", async () => {
  authResult = { authorized: true, operatorId: "operator-A", staffRole: "owner", user: { id: "u-1" } };
  fromImpl = () => makeNoMatchBuilder();
  const res = await POST(
    makePostRequest({ subjectType: "vehicle", subjectId: "vehicle-owned-by-operator-B", documentType: "insurance", file: "data:application/pdf;base64,AAAA" })
  );
  assert.equal(res.status, 403);
});

// operator's own id as an "operator" subjectId never touches the DB at all
// (subjectBelongsToOperator short-circuits to subjectId === operatorId), so
// this is the one case worth confirming directly: operator A cannot attach
// a document to operator B's own operator-level subject.
test("POST returns 403 when subjectId (operator) is a different operator's own id", async () => {
  authResult = { authorized: true, operatorId: "operator-A", staffRole: "owner", user: { id: "u-1" } };
  const res = await POST(
    makePostRequest({ subjectType: "operator", subjectId: "operator-B", documentType: "insurance", file: "data:application/pdf;base64,AAAA" })
  );
  assert.equal(res.status, 403);
});
