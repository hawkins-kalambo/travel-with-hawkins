import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

let authResult: unknown;
let currentRow: Record<string, unknown> | null;
let inserted: Record<string, unknown> | null;
let updatePayload: Record<string, unknown> | null;
let historyInserts: Record<string, unknown>[];

mock.module("@/lib/universityAdminAuth", {
  exports: { requireUniversityOperationsUser: async () => authResult },
});

function builder(table: string) {
  const chain: Record<string, unknown> = {
    select() { return chain; },
    eq() { return chain; },
    order() { return chain; },
    limit() { return Promise.resolve({ data: [currentRow].filter(Boolean), error: null }); },
    maybeSingle() { return Promise.resolve({ data: currentRow, error: null }); },
    insert(row: Record<string, unknown>) {
      if (table === "ai_knowledge_history") { historyInserts.push(row); return Promise.resolve({ data: null, error: null }); }
      inserted = row;
      return { select() { return this; }, single() { return Promise.resolve({ data: { id: "k-new", version: 1, ...row }, error: null }); } };
    },
    update(payload: Record<string, unknown>) {
      updatePayload = payload;
      return { eq() { return this; }, select() { return this; }, single() { return Promise.resolve({ data: { id: "k-1", ...currentRow, ...payload }, error: null }); } };
    },
    delete() { return { eq() { return Promise.resolve({ data: null, error: null }); } }; },
  };
  return chain;
}

mock.module("@/lib/supabaseAdmin", { exports: { supabaseAdmin: { from: (t: string) => builder(t) } } });
mock.module("@/lib/logger", { exports: { logError() {}, logWarn() {}, logInfo() {} } });

const { GET, POST, PATCH, DELETE } = await import("./route.ts");

const GLOBAL = { authorized: true, user: { id: "admin-1" }, role: "admin", isGlobal: true, universityIds: [] };
const SCOPED = { authorized: true, user: { id: "ua-1" }, role: "university_admin", isGlobal: false, universityIds: ["u1"] };

function reqOf(method: string, body?: unknown) {
  return new Request("https://x/api/admin/ai-knowledge", {
    method, headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  authResult = GLOBAL;
  currentRow = { id: "k-1", topic: "Booking fee", approved_answer: "It is separate.", version: 3, is_active: false, language: "en" };
  inserted = null;
  updatePayload = null;
  historyInserts = [];
});

test("GET: a scoped university admin is refused", async () => {
  authResult = SCOPED;
  assert.equal((await GET(reqOf("GET"))).status, 403);
});

test("GET: unauthenticated is refused", async () => {
  authResult = { authorized: false, error: "Authentication required", status: 401 };
  assert.equal((await GET(reqOf("GET"))).status, 401);
});

test("POST: requires topic and approvedAnswer", async () => {
  assert.equal((await POST(reqOf("POST", { topic: "x" })).then((r) => r.status)), 400);
  assert.equal((await POST(reqOf("POST", { approvedAnswer: "y" })).then((r) => r.status)), 400);
});

test("POST: creates version 1, stamps the author, writes a 'created' history row", async () => {
  const res = await POST(reqOf("POST", { topic: "Luggage", approvedAnswer: "One bag free.", category: "luggage" }));
  assert.equal(res.status, 200);
  assert.equal(inserted?.version, 1);
  assert.equal(inserted?.created_by, "admin-1");
  assert.equal(inserted?.is_active, false, "new entries are inactive until reviewed");
  assert.equal(historyInserts.length, 1);
  assert.equal(historyInserts[0].action, "created");
});

test("POST: a Chichewa entry defaults to requires_review", async () => {
  await POST(reqOf("POST", { topic: "Katundu", approvedAnswer: "Thumba limodzi.", language: "ny" }));
  assert.equal(inserted?.requires_review, true);
});

test("PATCH: bumps version, stamps updated_by, records history", async () => {
  const res = await PATCH(reqOf("PATCH", { id: "k-1", approvedAnswer: "It is separate from the fare." }));
  assert.equal(res.status, 200);
  assert.equal(updatePayload?.version, 4);
  assert.equal(updatePayload?.updated_by, "admin-1");
  assert.equal(historyInserts.at(-1)?.action, "updated");
});

test("PATCH: activating clears requires_review, stamps last_reviewed_at, logs 'activated'", async () => {
  const res = await PATCH(reqOf("PATCH", { id: "k-1", isActive: true }));
  assert.equal(res.status, 200);
  assert.equal(updatePayload?.is_active, true);
  assert.equal(updatePayload?.requires_review, false);
  assert.ok(typeof updatePayload?.last_reviewed_at === "string");
  assert.equal(historyInserts.at(-1)?.action, "activated");
});

test("PATCH: unknown id -> 404", async () => {
  currentRow = null;
  assert.equal((await PATCH(reqOf("PATCH", { id: "nope", topic: "x" }))).status, 404);
});

test("DELETE: records a 'deleted' history row before removing", async () => {
  const res = await DELETE(reqOf("DELETE", { id: "k-1" }));
  assert.equal(res.status, 200);
  assert.equal(historyInserts.at(-1)?.action, "deleted");
});

test("every write method refuses a scoped admin", async () => {
  authResult = SCOPED;
  assert.equal((await POST(reqOf("POST", { topic: "a", approvedAnswer: "b" }))).status, 403);
  assert.equal((await PATCH(reqOf("PATCH", { id: "k-1" }))).status, 403);
  assert.equal((await DELETE(reqOf("DELETE", { id: "k-1" }))).status, 403);
});
