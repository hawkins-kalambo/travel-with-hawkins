import assert from "node:assert/strict";
import test, { mock } from "node:test";

// GET has a genuinely two-tier design worth locking in: it only requires
// requireUniversityOperationsUser("manageRoutes") when status !== "active"
// — a public, customer-facing "active routes" read never requires auth at
// all, by design (app/api/routes/route.ts line ~57). POST/PATCH/DELETE all
// gate identically at the top, before any body/DB access.

let authResult: unknown;

// Some call sites await the query object directly (GET's "status=active"
// path, no .maybeSingle()); others call .maybeSingle() after .eq() (the
// PATCH/DELETE lookups that feed canAccessUniversity). This stub supports
// both terminal shapes so one builder covers every test in this file.
function makeRoutesBuilder(result: { data: unknown; error: unknown }) {
  const builder = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    in: () => builder,
    maybeSingle: async () => result,
    then: (resolve: (value: typeof result) => void) => resolve(result),
  };
  return builder;
}

let fromImpl: (table: string) => unknown = () => makeRoutesBuilder({ data: [], error: null });

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
  fromImpl = () => makeRoutesBuilder({ data: [], error: null });
});

const { GET, POST, PATCH, DELETE } = await import("./route.ts");

function makeGetRequest(query = "") {
  return new Request(`https://example.com/api/routes${query}`) as unknown as Parameters<typeof GET>[0];
}

function makeRequest(method: string, body?: Record<string, unknown>) {
  return new Request("https://example.com/api/routes", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as Parameters<typeof POST>[0];
}

test("GET returns 401 when unauthenticated and status is not 'active'", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await GET(makeGetRequest());
  assert.equal(res.status, 401);
});

test("GET returns 400 for an invalid direction, before the auth check", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await GET(makeGetRequest("?direction=sideways"));
  assert.equal(res.status, 400);
});

test("GET returns 200 for status=active without any authentication (the public read path)", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await GET(makeGetRequest("?status=active"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
});

test("POST returns 401 when the caller is not authenticated", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await POST(makeRequest("POST", { originDistrict: "Lilongwe" }));
  assert.equal(res.status, 401);
});

test("POST returns 403 when the caller's staff role lacks manageRoutes", async () => {
  authResult = { authorized: false, error: "This action is not permitted for your role", status: 403 };
  const res = await POST(makeRequest("POST", { originDistrict: "Lilongwe" }));
  assert.equal(res.status, 403);
});

test("PATCH returns 401 when the caller is not authenticated", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await PATCH(makeRequest("PATCH", { id: "route-1" }));
  assert.equal(res.status, 401);
});

test("PATCH returns 400 when id is missing, for an authorized caller", async () => {
  authResult = { authorized: true, isGlobal: true, universityIds: [] };
  const res = await PATCH(makeRequest("PATCH", {}));
  assert.equal(res.status, 400);
});

test("DELETE returns 401 when the caller is not authenticated", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await DELETE(makeRequest("DELETE", { id: "route-1" }));
  assert.equal(res.status, 401);
});

test("DELETE returns 400 when id is missing, for an authorized caller", async () => {
  authResult = { authorized: true, isGlobal: true, universityIds: [] };
  const res = await DELETE(makeRequest("DELETE", {}));
  assert.equal(res.status, 400);
});

// canAccessUniversity branches — Step 2 slice 6. A scoped (non-global)
// caller must never create/edit/delete a route outside their own assigned
// universities, even though they hold manageRoutes.

test("POST returns 403 when a scoped (non-global) caller tries to create a public-destination route", async () => {
  authResult = { authorized: true, isGlobal: false, universityIds: ["uni-mine"] };
  const res = await POST(makeRequest("POST", { originDistrict: "Lilongwe", destinationLabel: "Some Place" }));
  assert.equal(res.status, 403);
});

test("POST returns 403 when a scoped caller's universityId is outside their assignment", async () => {
  authResult = { authorized: true, isGlobal: false, universityIds: ["uni-mine"] };
  const res = await POST(
    makeRequest("POST", { originDistrict: "Lilongwe", universityId: "uni-other", districtPickupPointId: "dpp-1" })
  );
  assert.equal(res.status, 403);
});

test("PATCH returns 403 when the route belongs to a university outside the scoped caller's assignment", async () => {
  authResult = { authorized: true, isGlobal: false, universityIds: ["uni-mine"] };
  fromImpl = () => makeRoutesBuilder({ data: { id: "route-1", university_id: "uni-other", origin_district: "Lilongwe" }, error: null });
  const res = await PATCH(makeRequest("PATCH", { id: "route-1", fare: 6000 }));
  assert.equal(res.status, 403);
});

test("DELETE returns 403 when the route belongs to a university outside the scoped caller's assignment", async () => {
  authResult = { authorized: true, isGlobal: false, universityIds: ["uni-mine"] };
  fromImpl = () => makeRoutesBuilder({ data: { university_id: "uni-other" }, error: null });
  const res = await DELETE(makeRequest("DELETE", { id: "route-1" }));
  assert.equal(res.status, 403);
});
