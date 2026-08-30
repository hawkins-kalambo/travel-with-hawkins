import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

let authResult: unknown;
let rows: unknown[];
let patchRow: Record<string, unknown> | null;
let updatePayload: Record<string, unknown> | null;

mock.module("@/lib/universityAdminAuth", { exports: { requireUniversityOperationsUser: async () => authResult } });
mock.module("@/lib/logger", { exports: { logError() {}, logWarn() {}, logInfo() {} } });
mock.module("@/lib/whatsapp/ai/metrics", { exports: { aiQualitySummary: async (d: number) => ({ windowDays: d, turns: 3, fallbackRate: 0.33 }) } });
mock.module("@/lib/whatsapp/ai/flags", { exports: { aiFeatureSnapshot: () => ({ assistant: true, liveTools: false }) } });

function builder() {
  const chain: Record<string, unknown> = {
    select() { return chain; },
    order() { return chain; },
    eq() { return chain; },
    is() { return chain; },
    limit() { return chain; },
    update(p: Record<string, unknown>) { updatePayload = p; return chain; },
    maybeSingle() { return Promise.resolve({ data: patchRow, error: null }); },
    then(resolve: (v: unknown) => unknown) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
  };
  return chain;
}
mock.module("@/lib/supabaseAdmin", { exports: { supabaseAdmin: { from: () => builder() } } });

const { GET, PATCH } = await import("./route.ts");

const GLOBAL = { authorized: true, user: { id: "admin-1" }, role: "admin", isGlobal: true, universityIds: [] };
const SCOPED = { authorized: true, user: { id: "ua-1" }, role: "university_admin", isGlobal: false, universityIds: ["u1"] };

function getReq(qs = "") { return new Request(`https://x/api/admin/ai-interactions${qs}`) as unknown as Parameters<typeof GET>[0]; }
function patchReq(body: unknown) {
  return new Request("https://x/api/admin/ai-interactions", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as unknown as Parameters<typeof PATCH>[0];
}

beforeEach(() => {
  authResult = GLOBAL;
  rows = [{ id: "i-1", detected_intent: "fare_question", fallback_used: false }];
  patchRow = { id: "i-1", feedback: "correct" };
  updatePayload = null;
});

test("GET: scoped admin refused", async () => {
  authResult = SCOPED;
  assert.equal((await GET(getReq())).status, 403);
});

test("GET: list returns interactions", async () => {
  const res = await GET(getReq("?unreviewed=1"));
  assert.equal(res.status, 200);
  const body = await res.json() as { interactions: unknown[] };
  assert.equal(body.interactions.length, 1);
});

test("GET ?summary=1 returns the quality summary + feature snapshot", async () => {
  const res = await GET(getReq("?summary=1&days=14"));
  const body = await res.json() as { summary: { windowDays: number }; features: Record<string, boolean> };
  assert.equal(body.summary.windowDays, 14);
  assert.equal(body.features.assistant, true);
});

test("PATCH: sets a review verdict + reviewer", async () => {
  const res = await PATCH(patchReq({ id: "i-1", feedback: "needs_improvement" }));
  assert.equal(res.status, 200);
  assert.equal(updatePayload?.feedback, "needs_improvement");
  assert.equal(updatePayload?.reviewed_by, "admin-1");
  assert.ok(typeof updatePayload?.reviewed_at === "string");
});

test("PATCH: rejects a bad verdict", async () => {
  assert.equal((await PATCH(patchReq({ id: "i-1", feedback: "meh" }))).status, 400);
});

test("PATCH: unknown id -> 404", async () => {
  patchRow = null;
  assert.equal((await PATCH(patchReq({ id: "nope", feedback: "correct" }))).status, 404);
});

test("PATCH: scoped admin refused", async () => {
  authResult = SCOPED;
  assert.equal((await PATCH(patchReq({ id: "i-1", feedback: "correct" }))).status, 403);
});
