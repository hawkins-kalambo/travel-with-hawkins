import assert from "node:assert/strict";
import test, { mock } from "node:test";

// All four verbs gate identically at the top with
// requireUniversityOperationsUser("manageRoutes") (app/api/district-pickup-points/route.ts),
// and every body-validation check below that runs before any Supabase
// call — so an inert {} stub is enough; none of these tests should ever
// reach the database.

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

mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: {} },
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
