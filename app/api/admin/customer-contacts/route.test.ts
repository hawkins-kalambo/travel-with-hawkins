import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

// POST /api/admin/customer-contacts: admin-only, validates and normalizes the
// phone number before handing it to addCustomerContact().

let authorized = true;
let added: unknown[] = [];

mock.module("@/lib/supabaseServer", {
  exports: {
    requireAdminUser: async () => (authorized ? { authorized: true, user: { id: "admin-1" } } : { authorized: false, error: "Unauthorized" }),
  },
});

mock.module("@/lib/customerMessages", {
  exports: {
    listCustomerContacts: async () => ({ contacts: [], total: 0 }),
    setContactOptOut: async () => ({}),
    addCustomerContact: async (input: { phone: string }) => {
      added.push(input);
      return { contact: { id: "c1", ...input }, created: input.phone !== "+265881111111" };
    },
  },
});

const { POST } = await import("./route.ts");

function post(body: Record<string, unknown>) {
  return POST(
    new Request("https://example.com/api/admin/customer-contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as Parameters<typeof POST>[0]
  );
}

beforeEach(() => {
  authorized = true;
  added = [];
});

test("POST rejects callers who aren't admins", async () => {
  authorized = false;
  const res = await post({ phone: "0991234567" });
  assert.equal(res.status, 401);
  assert.equal(added.length, 0);
});

test("POST rejects a number that isn't a Malawi mobile", async () => {
  const res = await post({ phone: "12345" });
  assert.equal(res.status, 400);
  assert.equal(added.length, 0);
});

test("POST rejects a malformed email", async () => {
  const res = await post({ phone: "0991234567", email: "not-an-email" });
  assert.equal(res.status, 400);
});

test("POST normalizes the number and returns 201 for a new contact", async () => {
  const res = await post({ phone: "099 123 4567", name: "Chikondi", email: "c@example.com" });
  assert.equal(res.status, 201);
  assert.deepEqual(added, [{ phone: "+265991234567", name: "Chikondi", email: "c@example.com" }]);
  const data = await res.json();
  assert.equal(data.created, true);
});

test("POST returns 200 when the number is already a contact", async () => {
  const res = await post({ phone: "0881111111" });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).created, false);
});
