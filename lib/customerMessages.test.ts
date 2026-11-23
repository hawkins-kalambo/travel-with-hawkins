import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

// Covers typed-in numbers and hand-added contacts in lib/customerMessages.ts
// against a tiny in-memory stand-in for the Supabase query builder.

type Row = Record<string, unknown>;
type Result = { data: unknown; error: null };

let tables: Record<string, Row[]>;
let smsSentTo: string[];

function from(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let op: "select" | "insert" | "upsert" | "update" = "select";
  let payload: Row | Row[] = {};
  let single = false;

  const run = (): Result => {
    const rows = (tables[table] ??= []);
    if (op === "insert" || op === "upsert") {
      const added: Row[] = [];
      for (const item of Array.isArray(payload) ? payload : [payload]) {
        if (op === "upsert" && rows.some((row) => row.phone === item.phone)) continue;
        const row: Row = {
          id: `${table}-${rows.length + 1}`,
          name: null,
          email: null,
          booking_count: 0,
          sms_opt_out: false,
          email_opt_out: false,
          ...item,
        };
        rows.push(row);
        added.push(row);
      }
      return { data: single ? added[0] : added, error: null };
    }
    const matched = rows.filter((row) => filters.every((filter) => filter(row)));
    if (op === "update") matched.forEach((row) => Object.assign(row, payload));
    return { data: single ? (matched[0] ?? null) : matched, error: null };
  };

  const builder = {
    select: () => builder,
    order: () => builder,
    range: () => builder,
    in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), builder),
    eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
    single: () => ((single = true), builder),
    maybeSingle: () => ((single = true), builder),
    insert: (value: Row | Row[]) => ((op = "insert"), (payload = value), builder),
    upsert: (value: Row | Row[]) => ((op = "upsert"), (payload = value), builder),
    update: (value: Row) => ((op = "update"), (payload = value), builder),
    then: (resolve: (value: Result) => unknown) => resolve(run()),
  };
  return builder;
}

mock.module("@/lib/supabaseAdmin", { exports: { supabaseAdmin: { from } } });
mock.module("@/lib/supabaseServer", { exports: { escapeLikePattern: (value: string) => value } });
mock.module("@/lib/resend", { exports: { resend: null } });
mock.module("@/lib/logger", { exports: { logError: () => {}, logInfo: () => {}, logWarn: () => {} } });
mock.module("@/lib/africasTalking", {
  exports: {
    sendBulkSms: async ({ phones }: { phones: string[] }) => {
      smsSentTo.push(...phones);
      return new Map(phones.map((phone) => [phone, { success: true, status: "Success", messageId: `msg-${phone}` }]));
    },
  },
});

const { addCustomerContact, sendCustomerMessage, MANUAL_CONTACT_SOURCE } = await import("./customerMessages.ts");

function contact(fields: Row): Row {
  return { name: null, email: null, booking_count: 1, sms_opt_out: false, email_opt_out: false, ...fields };
}

function send(overrides: Partial<Parameters<typeof sendCustomerMessage>[0]> = {}) {
  return sendCustomerMessage({
    body: "Buses leave at 7am",
    channels: ["sms"],
    audience: "selected",
    contactIds: [],
    createdBy: "admin-1",
    ...overrides,
  });
}

beforeEach(() => {
  tables = { customer_contacts: [], customer_messages: [], customer_message_recipients: [] };
  smsSentTo = [];
});

test("a typed number that isn't a contact is sent to without being saved", async () => {
  const summary = await send({ phones: ["+265991234567"], saveNewContacts: false });

  assert.deepEqual(smsSentTo, ["+265991234567"]);
  assert.equal(summary.recipientCount, 1);
  assert.equal(summary.sms.sent, 1);
  assert.equal(tables.customer_contacts.length, 0);
  assert.equal(tables.customer_message_recipients[0].contact_id, null);
});

test("a typed number is saved as a contact when asked, and linked in the log", async () => {
  await send({ phones: ["+265991234567"], saveNewContacts: true });

  assert.equal(tables.customer_contacts.length, 1);
  const saved = tables.customer_contacts[0];
  assert.equal(saved.phone, "+265991234567");
  assert.equal(saved.first_source, MANUAL_CONTACT_SOURCE);
  assert.equal(tables.customer_message_recipients[0].contact_id, saved.id);
});

test("a typed number that belongs to an opted-out contact is skipped", async () => {
  tables.customer_contacts.push(contact({ id: "c1", phone: "+265881234567", sms_opt_out: true }));

  const summary = await send({ phones: ["+265881234567"] });

  assert.deepEqual(smsSentTo, []);
  assert.equal(summary.sms.skipped, 1);
  assert.equal(tables.customer_message_recipients[0].contact_id, "c1");
});

test("a typed number that's also a selected contact only gets one message", async () => {
  tables.customer_contacts.push(contact({ id: "c1", phone: "+265991234567" }));

  const summary = await send({ contactIds: ["c1"], phones: ["+265991234567", "+265991234567"] });

  assert.deepEqual(smsSentTo, ["+265991234567"]);
  assert.equal(summary.recipientCount, 1);
});

test("addCustomerContact creates a new contact", async () => {
  const { contact: saved, created } = await addCustomerContact({ phone: "+265991234567", name: " Chikondi ", email: "C@Example.com" });

  assert.equal(created, true);
  assert.equal(saved.name, "Chikondi");
  assert.equal(saved.email, "c@example.com");
});

test("addCustomerContact keeps an existing contact's details, only filling blanks", async () => {
  tables.customer_contacts.push(contact({ id: "c1", phone: "+265991234567", name: "Chikondi" }));

  const { contact: saved, created } = await addCustomerContact({ phone: "+265991234567", name: "Someone Else", email: "c@example.com" });

  assert.equal(created, false);
  assert.equal(saved.name, "Chikondi");
  assert.equal(saved.email, "c@example.com");
  assert.equal(tables.customer_contacts.length, 1);
});
