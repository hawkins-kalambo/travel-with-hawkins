import assert from "node:assert/strict";
import test, { mock } from "node:test";

process.env.CRON_SECRET = "cron-test-secret";

let rpcResult: { data: unknown; error: unknown } = { data: [], error: null };
const processed: string[] = [];

mock.module("@/lib/logger", { exports: { logInfo() {}, logWarn() {}, logError() {} } });
mock.module("@/lib/supabaseAdmin", {
  exports: { supabaseAdmin: { rpc: async () => rpcResult } },
});
mock.module("@/lib/whatsapp/processor", {
  exports: { processWhatsAppEvent: async (id: string) => { processed.push(id); } },
});
let redriveResult = { candidates: 0, delivered: 0 };
mock.module("@/lib/payments/receipt-redrive", {
  exports: { redriveReceiptDeliveries: async () => redriveResult },
});

const expire = await import("./../whatsapp-expire-reservations/route.ts");
const recover = await import("./route.ts");

function req(auth?: string) {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = auth;
  return new Request("https://example.com/api/cron/x", { headers }) as unknown as Parameters<typeof recover.GET>[0];
}

test("recover: rejects a request with no bearer token", async () => {
  assert.equal((await recover.GET(req())).status, 401);
});

test("recover: rejects a wrong bearer token", async () => {
  assert.equal((await recover.GET(req("Bearer nope"))).status, 401);
});

test("expire: rejects an unauthorised request", async () => {
  assert.equal((await expire.GET(req())).status, 401);
});

test("expire: authorised request returns the released count", async () => {
  rpcResult = { data: [{ booking_id: "BK-1" }, { booking_id: "BK-2" }], error: null };
  const res = await expire.GET(req("Bearer cron-test-secret"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, expired: 2 });
});

test("recover: reprocesses the ids the recovery function returns", async () => {
  processed.length = 0;
  redriveResult = { candidates: 1, delivered: 1 };
  rpcResult = { data: [{ event_id: "e1" }, { event_id: "e2" }], error: null };
  const res = await recover.GET(req("Bearer cron-test-secret"));
  assert.deepEqual(await res.json(), { ok: true, candidates: 2, processed: 2, receipts: { candidates: 1, delivered: 1 } });
  assert.deepEqual(processed, ["e1", "e2"]);
});

test("recover: degrades quietly when the recovery function is not applied yet", async () => {
  rpcResult = { data: null, error: { message: "function public.recover_whatsapp_webhook_events(integer, integer) does not exist" } };
  const res = await recover.GET(req("Bearer cron-test-secret"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, skipped: "recovery_function_unavailable" });
});
