import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

// Covers the student-vs-general route extension of /api/routes:
//  - a general route needs two districts, no university, and a global admin
//  - a student route still validates its university + pickup points
//  - is_popular / popular_order flow through on both POST and PATCH
// The auth resolver and Supabase client are mocked so the handler logic is
// exercised directly.

let authResult: unknown;
let inserted: Record<string, unknown> | null;
let updatePayload: Record<string, unknown> | null;
let districtPointRow: Record<string, unknown> | null;
let campusPointRows: Record<string, unknown>[];
let campusPointRow: Record<string, unknown> | null;
let currentRouteRow: Record<string, unknown> | null;
let insertError: { code?: string; message?: string } | null;

mock.module("@/lib/universityAdminAuth", {
  exports: {
    requireUniversityOperationsUser: async () => authResult,
    canAccessUniversity: (ctx: { isGlobal: boolean; universityIds: string[] }, id: unknown) =>
      ctx.isGlobal || (typeof id === "string" && ctx.universityIds.includes(id)),
  },
});

function selectResult(table: string) {
  // Reads that the handler performs by id via .maybeSingle()
  if (table === "district_pickup_points") return { data: districtPointRow, error: null };
  if (table === "university_pickup_points") return { data: campusPointRow, error: null };
  if (table === "routes") return { data: currentRouteRow, error: null };
  return { data: null, error: null };
}

function builder(table: string) {
  const chain: Record<string, unknown> = {
    _table: table,
    select() { return chain; },
    eq() { return chain; },
    in() { return chain; },
    order() { return chain; },
    maybeSingle() { return Promise.resolve(selectResult(table)); },
    insert(rows: Record<string, unknown>[]) {
      inserted = rows[0];
      return {
        select() { return this; },
        single() {
          if (insertError) return Promise.resolve({ data: null, error: insertError });
          return Promise.resolve({ data: { id: "route-new", ...rows[0] }, error: null });
        },
      };
    },
    update(payload: Record<string, unknown>) {
      updatePayload = payload;
      return {
        eq() { return this; },
        select() { return this; },
        single() { return Promise.resolve({ data: { id: "route-1", ...payload }, error: null }); },
      };
    },
    then(resolve: (v: unknown) => unknown) {
      // Used for the un-.maybeSingle() campus-points list query
      return Promise.resolve({ data: campusPointRows, error: null }).then(resolve);
    },
  };
  return chain;
}

mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: { from: (t: string) => builder(t) } },
});

const { POST, PATCH } = await import("./route.ts");

const GLOBAL = { authorized: true, user: { id: "u1" }, role: "admin", isGlobal: true, universityIds: [] };
const SCOPED = { authorized: true, user: { id: "u2" }, role: "university_admin", isGlobal: false, universityIds: ["uni-1"] };

function postReq(body: Record<string, unknown>) {
  return new Request("https://example.com/api/routes", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}
function patchReq(body: Record<string, unknown>) {
  return new Request("https://example.com/api/routes", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }) as unknown as Parameters<typeof PATCH>[0];
}

beforeEach(() => {
  authResult = GLOBAL;
  inserted = null;
  updatePayload = null;
  insertError = null;
  districtPointRow = { id: "dp-1", university_id: "uni-1", district: "Lilongwe", status: "active" };
  campusPointRows = [{ id: "cp-1" }];
  campusPointRow = { university_id: "uni-1" };
  currentRouteRow = { id: "route-1", university_id: "uni-1", origin_district: "Lilongwe" };
});

// --- general routes ---

test("POST general route: inserts with no university, direction general, and the popular flags", async () => {
  const res = await POST(postReq({
    routeType: "general", originDistrict: "Lilongwe", destinationDistrict: "Blantyre",
    fare: 18000, isPopular: true, popularOrder: 1,
  }));
  assert.equal(res.status, 200);
  assert.equal(inserted?.route_type, "general");
  assert.equal(inserted?.direction, "general");
  assert.equal(inserted?.university_id, null);
  assert.equal(inserted?.destination_district, "Blantyre");
  assert.equal(inserted?.is_popular, true);
  assert.equal(inserted?.popular_order, 1);
});

test("POST general route: rejects a scoped university admin (403)", async () => {
  authResult = SCOPED;
  const res = await POST(postReq({
    routeType: "general", originDistrict: "Lilongwe", destinationDistrict: "Blantyre", fare: 18000,
  }));
  assert.equal(res.status, 403);
  assert.equal(inserted, null);
});

test("POST general route: rejects same origin and destination district", async () => {
  const res = await POST(postReq({
    routeType: "general", originDistrict: "Lilongwe", destinationDistrict: "Lilongwe", fare: 1,
  }));
  assert.equal(res.status, 400);
});

test("POST general route: rejects a non-district destination", async () => {
  const res = await POST(postReq({
    routeType: "general", originDistrict: "Lilongwe", destinationDistrict: "Nairobi", fare: 1,
  }));
  assert.equal(res.status, 400);
});

test("POST general route: a duplicate corridor is a 409", async () => {
  insertError = { code: "23505", message: "duplicate key value violates unique constraint \"idx_routes_general_leg\"" };
  const res = await POST(postReq({
    routeType: "general", originDistrict: "Lilongwe", destinationDistrict: "Blantyre", fare: 1,
  }));
  assert.equal(res.status, 409);
});

// --- student routes still work ---

test("POST student route: still validates and inserts, now stamping route_type student + popular flags", async () => {
  const res = await POST(postReq({
    originDistrict: "Lilongwe", universityId: "uni-1", districtPickupPointId: "dp-1",
    direction: "to_university", fare: 15000, isPopular: true, popularOrder: 2,
  }));
  assert.equal(res.status, 200);
  assert.equal(inserted?.university_id, "uni-1");
  assert.equal(inserted?.route_type, "student");
  assert.equal(inserted?.direction, "to_university");
  assert.equal(inserted?.is_popular, true);
  assert.equal(inserted?.popular_order, 2);
});

test("POST student route: a mismatched district pickup point is a 400", async () => {
  districtPointRow = { id: "dp-1", university_id: "other-uni", district: "Lilongwe", status: "active" };
  const res = await POST(postReq({
    originDistrict: "Lilongwe", universityId: "uni-1", districtPickupPointId: "dp-1", fare: 1,
  }));
  assert.equal(res.status, 400);
});

// --- PATCH ---

test("PATCH: toggling is_popular / popular_order flows into the update payload", async () => {
  const res = await PATCH(patchReq({ id: "route-1", isPopular: true, popularOrder: 3 }));
  assert.equal(res.status, 200);
  assert.equal(updatePayload?.is_popular, true);
  assert.equal(updatePayload?.popular_order, 3);
});

test("PATCH: clearing popular_order sends null", async () => {
  const res = await PATCH(patchReq({ id: "route-1", isPopular: false, popularOrder: null }));
  assert.equal(res.status, 200);
  assert.equal(updatePayload?.is_popular, false);
  assert.equal(updatePayload?.popular_order, null);
});

test("PATCH: an unauthenticated caller is rejected", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await PATCH(patchReq({ id: "route-1", isPopular: true }));
  assert.equal(res.status, 401);
});
