import assert from "node:assert/strict";
import test, { mock } from "node:test";

// The WhatsApp admin inbox is mounted in the communication center UI, so the
// server guard is what actually protects conversation data. These tests fail
// if requireWhatsAppAdmin is removed or weakened: same pattern as
// app/api/admin/operators/route.test.ts.

let authResult: unknown;

mock.module("@/lib/supabaseServer", {
  exports: { requireAdminUser: async () => authResult },
});
mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: {} },
});
mock.module("@/lib/whatsapp/repository", {
  exports: { deliverAndRecord: async () => { throw new Error("must not deliver without authorization"); } },
});

const list = await import("./route.ts");
const detail = await import("./[id]/route.ts");

function req(url = "https://example.com/api/admin/whatsapp/conversations", init: RequestInit = {}) {
  return new Request(url, init) as unknown as Parameters<typeof list.GET>[0];
}
const params = Promise.resolve({ id: "conv-1" });

test("GET conversations rejects an unauthenticated caller", async () => {
  authResult = { authorized: false, user: null, error: "Authentication required" };
  assert.equal((await list.GET(req())).status, 403);
});

test("GET conversations rejects an authenticated non-admin", async () => {
  authResult = { authorized: false, user: null, error: "Admin access required" };
  assert.equal((await list.GET(req())).status, 403);
});

test("GET conversations rejects a cross-site request from a real admin", async () => {
  authResult = { authorized: true, user: { id: "admin-1" }, role: "admin", error: null };
  const response = await list.GET(req("https://example.com/api/admin/whatsapp/conversations", { headers: { "sec-fetch-site": "cross-site" } }));
  assert.equal(response.status, 403);
});

test("PATCH conversation (handoff actions) rejects an unauthenticated caller", async () => {
  authResult = { authorized: false, user: null, error: "Authentication required" };
  const request = req("https://example.com/api/admin/whatsapp/conversations/conv-1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "takeover" }) });
  assert.equal((await detail.PATCH(request as Parameters<typeof detail.PATCH>[0], { params })).status, 403);
});

test("POST conversation reply rejects an unauthenticated caller", async () => {
  authResult = { authorized: false, user: null, error: "Authentication required" };
  const request = req("https://example.com/api/admin/whatsapp/conversations/conv-1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "reply", body: "hello" }) });
  assert.equal((await detail.POST(request as Parameters<typeof detail.POST>[0], { params })).status, 403);
});
