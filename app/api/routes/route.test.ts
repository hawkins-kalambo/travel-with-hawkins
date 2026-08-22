import assert from "node:assert/strict";
import test, { mock } from "node:test";

// GET has a genuinely two-tier design worth locking in: it only requires
// requireUniversityOperationsUser("manageRoutes") when status !== "active"
// — a public, customer-facing "active routes" read never requires auth at
// all, by design (app/api/routes/route.ts line ~57). POST/PATCH/DELETE all
// gate identically at the top, before any body/DB access.

let authResult: unknown;

mock.module("@/lib/universityAdminAuth", {
  exports: {
    requireUniversityOperationsUser: async () => authResult,
    // route.ts imports this alongside requireUniversityOperationsUser —
    // mock.module replaces the whole module, so it must be present even
    // though none of these tests exercise the branches that call it.
    canAccessUniversity: () => true,
  },
});

// The GET "status=active" path awaits the query object directly (no
// .maybeSingle() call), so the stub itself needs to be thenable.
function makeEmptyRoutesBuilder() {
  const result = { data: [], error: null };
  const builder = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    in: () => builder,
    then: (resolve: (value: typeof result) => void) => resolve(result),
  };
  return builder;
}

mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: { from: () => makeEmptyRoutesBuilder() } },
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
