import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createHmac } from "node:crypto";

process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-test-token";
process.env.META_APP_SECRET = "meta-test-secret";
process.env.WHATSAPP_BOT_ENABLED = "false";
process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "WABA-EXPECTED";
process.env.WHATSAPP_PHONE_NUMBER_ID = "PN-EXPECTED";

const storeCalls: unknown[] = [];
const scheduled: string[][] = [];
let storeReturnsProcessed = false;

mock.module("@/lib/whatsapp/repository", {
  exports: {
    storeWebhookEvent: async (event: { id: string }) => {
      storeCalls.push(event);
      return { id: `stored-${event.id}`, processing_status: storeReturnsProcessed ? "processed" : "received" };
    },
  },
});
mock.module("@/lib/whatsapp/processor", {
  exports: {
    processWhatsAppEvent: async () => { throw new Error("processWhatsAppEvent must not run inside the request"); },
    // Mirrors the real guard: an empty id list schedules nothing.
    scheduleWhatsAppProcessing: (ids: string[]) => { if (ids.length) scheduled.push(ids); },
  },
});

const { GET, POST } = await import("./route.ts");

function sign(body: string) {
  return `sha256=${createHmac("sha256", process.env.META_APP_SECRET!).update(body).digest("hex")}`;
}

function post(body: string, headers: Record<string, string> = { "x-hub-signature-256": sign(body) }) {
  return POST(new Request("https://example.com/api/whatsapp/webhook", { method: "POST", body, headers }) as Parameters<typeof POST>[0]);
}

function envelope(entries: unknown[]) {
  return JSON.stringify({ object: "whatsapp_business_account", entry: entries });
}

function messageEntry(opts: { waba?: string; phoneNumberId?: string; id?: string } = {}) {
  return {
    id: opts.waba ?? "WABA-EXPECTED",
    changes: [{
      field: "messages",
      value: {
        metadata: { phone_number_id: opts.phoneNumberId ?? "PN-EXPECTED" },
        contacts: [{ profile: { name: "Test" } }],
        messages: [{ id: opts.id ?? "wamid.1", from: "265991234567", type: "text", text: { body: "menu" } }],
      },
    }],
  };
}

function reset(enabled = false) {
  storeCalls.length = 0;
  scheduled.length = 0;
  storeReturnsProcessed = false;
  process.env.WHATSAPP_BOT_ENABLED = enabled ? "true" : "false";
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "WABA-EXPECTED";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "PN-EXPECTED";
}

test("GET verifies the configured Meta challenge", async () => {
  const request = new Request("https://example.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-test-token&hub.challenge=12345");
  const response = await GET(request as Parameters<typeof GET>[0]);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "12345");
});

test("GET rejects an incorrect verification token", async () => {
  const request = new Request("https://example.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345");
  assert.equal((await GET(request as Parameters<typeof GET>[0])).status, 403);
});

test("POST rejects missing and invalid Meta signatures", async () => {
  reset();
  const body = JSON.stringify({ object: "whatsapp_business_account" });
  assert.equal((await post(body, {})).status, 401);
  assert.equal((await post(body, { "x-hub-signature-256": `sha256=${"0".repeat(64)}` })).status, 401);
});

test("POST acknowledges signed events without storing while the feature is disabled", async () => {
  reset();
  const response = await post(envelope([messageEntry()]));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, enabled: false });
  assert.equal(storeCalls.length, 0);
  assert.equal(scheduled.length, 0);
});

test("POST rejects malformed signed JSON", async () => {
  reset();
  assert.equal((await post("{broken")).status, 400);
});

test("POST persists and schedules events from the configured account when enabled", async () => {
  reset(true);
  const response = await post(envelope([messageEntry({ id: "wamid.match" })]));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, persisted: 1 });
  assert.equal(storeCalls.length, 1);
  assert.deepEqual(scheduled, [["stored-wamid.match"]]);
});

test("POST ignores events from an unexpected WABA or phone number id", async () => {
  reset(true);
  const response = await post(envelope([
    messageEntry({ waba: "WABA-OTHER", id: "wamid.badwaba" }),
    messageEntry({ phoneNumberId: "PN-OTHER", id: "wamid.badpn" }),
  ]));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, persisted: 0 });
  assert.equal(storeCalls.length, 0);
  assert.equal(scheduled.length, 0);
});

test("POST keeps the matching half of a mixed-account batch", async () => {
  reset(true);
  const response = await post(envelope([
    messageEntry({ id: "wamid.keep" }),
    messageEntry({ waba: "WABA-OTHER", id: "wamid.drop" }),
  ]));
  assert.deepEqual(await response.json(), { success: true, persisted: 1 });
  assert.equal(storeCalls.length, 1);
});

test("POST stores a matching status-only event", async () => {
  reset(true);
  const body = envelope([{
    id: "WABA-EXPECTED",
    changes: [{ field: "messages", value: { metadata: { phone_number_id: "PN-EXPECTED" }, statuses: [{ id: "wamid.s1", status: "delivered", recipient_id: "265991234567" }] } }],
  }]);
  const response = await post(body);
  assert.deepEqual(await response.json(), { success: true, persisted: 1 });
  assert.equal(storeCalls.length, 1);
});

test("POST does not re-schedule an event that storage reports already processed", async () => {
  reset(true);
  storeReturnsProcessed = true;
  const response = await post(envelope([messageEntry({ id: "wamid.dup" })]));
  assert.deepEqual(await response.json(), { success: true, persisted: 1 });
  assert.equal(scheduled.length, 0);
});

test("POST acknowledges without storing when account identifiers are unconfigured", async () => {
  reset(true);
  delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const response = await post(envelope([messageEntry()]));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, persisted: 0, ignored: "unconfigured" });
  assert.equal(storeCalls.length, 0);
});
