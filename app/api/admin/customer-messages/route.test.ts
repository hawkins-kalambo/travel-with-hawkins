import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

// POST /api/admin/customer-messages with typed-in phone numbers.

let sent: Record<string, unknown>[] = [];

mock.module("@/lib/supabaseServer", {
  exports: { requireAdminUser: async () => ({ authorized: true, user: { id: "admin-1" } }) },
});

mock.module("@/lib/rateLimit", { exports: { isRateLimited: async () => false } });

mock.module("@/lib/customerMessages", {
  exports: {
    MAX_MESSAGE_LENGTH: 2000,
    listCustomerMessages: async () => [],
    sendCustomerMessage: async (input: Record<string, unknown>) => {
      sent.push(input);
      return { messageId: "m1", status: "sent", recipientCount: 1, sms: { sent: 1, failed: 0, skipped: 0 }, email: { sent: 0, failed: 0, skipped: 0 } };
    },
  },
});

const { POST } = await import("./route.ts");

function post(body: Record<string, unknown>) {
  return POST(
    new Request("https://example.com/api/admin/customer-messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "Hello", channels: ["sms"], audience: "selected", ...body }),
    }) as unknown as Parameters<typeof POST>[0]
  );
}

beforeEach(() => {
  sent = [];
});

test("POST sends to typed numbers alone, normalized and de-duplicated", async () => {
  const res = await post({ phones: ["0991234567", "+265 99 123 4567", "0881234567"], saveNewContacts: true });
  assert.equal(res.status, 200);
  assert.deepEqual(sent[0].phones, ["+265991234567", "+265881234567"]);
  assert.equal(sent[0].saveNewContacts, true);
});

test("POST rejects an invalid typed number and sends nothing", async () => {
  const res = await post({ phones: ["0991234567", "12345"] });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /12345/);
  assert.equal(sent.length, 0);
});

test("POST still needs a selected customer or a typed number", async () => {
  const res = await post({ contactIds: [], phones: [] });
  assert.equal(res.status, 400);
  assert.equal(sent.length, 0);
});
