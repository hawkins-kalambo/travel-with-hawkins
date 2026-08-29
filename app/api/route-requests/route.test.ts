import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

// /api/route-requests is a global-operations-admin review queue for the
// customer-submitted "you don't run this corridor" requests. These tests
// mock the auth resolver and Supabase client to exercise the handler.

let authResult: unknown;
let listRows: unknown[];
let patchRow: Record<string, unknown> | null;
let updatePayload: Record<string, unknown> | null;

mock.module("@/lib/universityAdminAuth", {
  exports: { requireUniversityOperationsUser: async () => authResult },
});

function builder() {
  const chain: Record<string, unknown> = {
    select() { return chain; },
    order() { return chain; },
    limit() { return chain; },
    eq() { return chain; },
    update(payload: Record<string, unknown>) { updatePayload = payload; return chain; },
    maybeSingle() { return Promise.resolve({ data: patchRow, error: null }); },
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve({ data: listRows, error: null }).then(resolve);
    },
  };
  return chain;
}

mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: { from: () => builder() } },
});

const { GET, PATCH } = await import("./route.ts");

const GLOBAL = { authorized: true, user: { id: "admin-1" }, role: "admin", isGlobal: true, universityIds: [] };
const SCOPED = { authorized: true, user: { id: "ua-1" }, role: "university_admin", isGlobal: false, universityIds: ["uni-1"] };

function getReq(qs = "") {
  return new Request(`https://example.com/api/route-requests${qs}`) as unknown as Parameters<typeof GET>[0];
}
function patchReq(body: Record<string, unknown>) {
  return new Request("https://example.com/api/route-requests", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }) as unknown as Parameters<typeof PATCH>[0];
}

beforeEach(() => {
  authResult = GLOBAL;
  listRows = [{ id: "rr-1", origin: "Karonga", destination: "Ntcheu", status: "new" }];
  patchRow = { id: "rr-1", origin: "Karonga", destination: "Ntcheu", status: "added" };
  updatePayload = null;
});

test("GET: unauthenticated caller is rejected", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  const res = await GET(getReq());
  assert.equal(res.status, 401);
});

test("GET: a scoped university admin is refused (403)", async () => {
  authResult = SCOPED;
  const res = await GET(getReq());
  assert.equal(res.status, 403);
});

test("GET: a global admin gets the list", async () => {
  const res = await GET(getReq());
  assert.equal(res.status, 200);
  const body = await res.json() as { success: boolean; requests: unknown[] };
  assert.equal(body.success, true);
  assert.equal(body.requests.length, 1);
});

test("GET: an invalid status filter is a 400", async () => {
  const res = await GET(getReq("?status=bogus"));
  assert.equal(res.status, 400);
});

test("PATCH: marking a request 'added' stamps the reviewer and time", async () => {
  const res = await PATCH(patchReq({ id: "rr-1", status: "added" }));
  assert.equal(res.status, 200);
  assert.equal(updatePayload?.status, "added");
  assert.equal(updatePayload?.reviewed_by, "admin-1");
  assert.ok(typeof updatePayload?.reviewed_at === "string");
});

test("PATCH: moving back to 'reviewing' clears the reviewer stamp", async () => {
  const res = await PATCH(patchReq({ id: "rr-1", status: "reviewing" }));
  assert.equal(res.status, 200);
  assert.equal(updatePayload?.status, "reviewing");
  assert.equal(updatePayload?.reviewed_by, null);
  assert.equal(updatePayload?.reviewed_at, null);
});

test("PATCH: an invalid status is a 400", async () => {
  const res = await PATCH(patchReq({ id: "rr-1", status: "done" }));
  assert.equal(res.status, 400);
});

test("PATCH: a missing id is a 400", async () => {
  const res = await PATCH(patchReq({ status: "added" }));
  assert.equal(res.status, 400);
});

test("PATCH: an unknown request id is a 404", async () => {
  patchRow = null;
  const res = await PATCH(patchReq({ id: "nope", status: "added" }));
  assert.equal(res.status, 404);
});

test("PATCH: a scoped university admin is refused (403)", async () => {
  authResult = SCOPED;
  const res = await PATCH(patchReq({ id: "rr-1", status: "added" }));
  assert.equal(res.status, 403);
});
