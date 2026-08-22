import assert from "node:assert/strict";
import test, { mock } from "node:test";

// All four verbs gate identically at the top with
// requireUniversityOperationsUser("manageRoutes") (app/api/district-pickup-points/route.ts).
// Most body-validation checks run before any Supabase call; PATCH/DELETE's
// canAccessUniversity check is the exception (it needs a DB lookup first)
// — see the reassignable fromImpl below.

let authResult: unknown;

function makePickupPointBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => result,
  };
  return builder;
}

let fromImpl: (table: string) => unknown = () => makePickupPointBuilder({ data: null, error: null });

// Mocked before the relative import below so that when
// lib/universityAdminAuth.ts's own `import ... from "@/lib/supabaseAdmin"`
// runs, it resolves to this mock too — otherwise it tries to construct a
// real Supabase client with no env vars set and throws at import time.
mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: { from: (table: string) => fromImpl(table) } },
});

// canAccessUniversity (lib/universityAdminAuth.ts) is a small pure function
// — context.isGlobal ? true : context.universityIds.includes(universityId)
// — so it's left unmocked here and allowed to run for real, same precedent
// as hasPermission/normalizeAppRole in app/api/admin/users/route.test.ts.
// mock.module replaces the whole "@/lib/universityAdminAuth" module for
// every importer, so the real function has to be imported via a relative
// path (not intercepted) and re-exported alongside the mocked one.
const { canAccessUniversity } = await import("../../../lib/universityAdminAuth.ts");

mock.module("@/lib/universityAdminAuth", {
  exports: {
    requireUniversityOperationsUser: async () => authResult,
    canAccessUniversity,
  },
});

test.beforeEach(() => {
  fromImpl = () => makePickupPointBuilder({ data: null, error: null });
});

const { GET, POST, PATCH, DELETE } = await import("./route.ts");

function makeGetRequest() {
  return new Request("https://example.com/api/district-pickup-points") as unknown as Parameters<typeof GET>[0];
}

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new Request("https://example.com/api/district-pickup-points", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as Parameters<typeof POST>[0];
}

test("GET returns 401 when the caller is not authenticated", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await GET(makeGetRequest());
  assert.equal(res.status, 401);
});

test("POST returns 401 when the caller is not authenticated", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await POST(makeRequest("POST", { universityId: "uni-1", district: "Lilongwe", label: "Main Gate" }));
  assert.equal(res.status, 401);
});

test("POST returns 400 when required fields are missing, for an authorized caller", async () => {
  authResult = { authorized: true, isGlobal: true, universityIds: [] };
  const res = await POST(makeRequest("POST", { universityId: "uni-1" }));
  assert.equal(res.status, 400);
});

test("POST returns 400 for an invalid district, for an authorized caller", async () => {
  authResult = { authorized: true, isGlobal: true, universityIds: [] };
  const res = await POST(makeRequest("POST", { universityId: "uni-1", district: "Narnia", label: "Main Gate" }));
  assert.equal(res.status, 400);
});

test("PATCH returns 401 when the caller is not authenticated", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await PATCH(makeRequest("PATCH", { id: "point-1" }));
  assert.equal(res.status, 401);
});

test("PATCH returns 400 when id is missing, for an authorized caller", async () => {
  authResult = { authorized: true, isGlobal: true, universityIds: [] };
  const res = await PATCH(makeRequest("PATCH", {}));
  assert.equal(res.status, 400);
});

test("DELETE returns 401 when the caller is not authenticated", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await DELETE(makeRequest("DELETE", { id: "point-1" }));
  assert.equal(res.status, 401);
});

test("DELETE returns 400 when id is missing, for an authorized caller", async () => {
  authResult = { authorized: true, isGlobal: true, universityIds: [] };
  const res = await DELETE(makeRequest("DELETE", {}));
  assert.equal(res.status, 400);
});

// canAccessUniversity branches — Step 2 slice 6. A scoped (non-global)
// caller must never create/edit/delete a pickup point outside their own
// assigned universities, even though they hold manageRoutes.

test("POST returns 403 when a scoped caller's universityId is outside their assignment", async () => {
  authResult = { authorized: true, isGlobal: false, universityIds: ["uni-mine"] };
  const res = await POST(makeRequest("POST", { universityId: "uni-other", district: "Lilongwe", label: "Main Gate" }));
  assert.equal(res.status, 403);
});

test("PATCH returns 403 when the pickup point belongs to a university outside the scoped caller's assignment", async () => {
  authResult = { authorized: true, isGlobal: false, universityIds: ["uni-mine"] };
  fromImpl = () => makePickupPointBuilder({ data: { id: "point-1", university_id: "uni-other" }, error: null });
  const res = await PATCH(makeRequest("PATCH", { id: "point-1", label: "New Label" }));
  assert.equal(res.status, 403);
});

test("DELETE returns 403 when the pickup point belongs to a university outside the scoped caller's assignment", async () => {
  authResult = { authorized: true, isGlobal: false, universityIds: ["uni-mine"] };
  fromImpl = () => makePickupPointBuilder({ data: { university_id: "uni-other" }, error: null });
  const res = await DELETE(makeRequest("DELETE", { id: "point-1" }));
  assert.equal(res.status, 403);
});
