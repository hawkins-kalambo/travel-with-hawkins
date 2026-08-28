import assert from "node:assert/strict";
import test from "node:test";
import { parseWhatsAppWebhook, partitionEventsByAccount, webhookEventKey } from "./parser.ts";
import type { WhatsAppParsedEvent } from "./types.ts";

function payload(message: Record<string, unknown>, value: Record<string, unknown> = {}, entry: Record<string, unknown> = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [{ ...entry, changes: [{ field: "messages", value: { contacts: [{ profile: { name: "Test" } }], messages: [message], ...value } }] }],
  };
}

test("parses text messages", () => {
  const [event] = parseWhatsAppWebhook(payload({ id: "wamid.1", from: "265991234567", type: "text", text: { body: "menu" } }));
  assert.deepEqual(event, { kind: "message", id: "wamid.1", from: "+265991234567", timestamp: undefined, displayName: "Test", inputType: "text", text: "menu", actionId: undefined, accountId: undefined, phoneNumberId: undefined });
  assert.equal(webhookEventKey(event), "meta:message:wamid.1");
});

test("parses button and list replies using stable action ids", () => {
  const [button] = parseWhatsAppWebhook(payload({ id: "wamid.2", from: "265991234567", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "menu_booking", title: "Book" } } }));
  const [list] = parseWhatsAppWebhook(payload({ id: "wamid.3", from: "265991234567", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "menu_routes", title: "Routes" } } }));
  assert.equal(button.kind === "message" && button.actionId, "menu_booking");
  assert.equal(button.kind === "message" && button.inputType, "button");
  assert.equal(list.kind === "message" && list.actionId, "menu_routes");
  assert.equal(list.kind === "message" && list.inputType, "list");
});

test("parses delivery failures without retaining provider error text", () => {
  const events = parseWhatsAppWebhook({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { statuses: [{ id: "wamid.out", status: "failed", recipient_id: "265991234567", errors: [{ code: 131000, message: "sensitive provider detail" }] }] } }] }] });
  assert.deepEqual(events[0], { kind: "status", id: "wamid.out", status: "failed", timestamp: undefined, recipientId: "+265991234567", errorCode: "131000", accountId: undefined, phoneNumberId: undefined });
});

test("captures the WABA id and phone number id from the envelope", () => {
  const [event] = parseWhatsAppWebhook(payload(
    { id: "wamid.4", from: "265991234567", type: "text", text: { body: "hi" } },
    { metadata: { display_phone_number: "265000000000", phone_number_id: "PN-123" } },
    { id: "WABA-999" },
  ));
  assert.equal(event.kind === "message" && event.accountId, "WABA-999");
  assert.equal(event.kind === "message" && event.phoneNumberId, "PN-123");
});

const EXPECTED = { wabaId: "WABA-999", phoneNumberId: "PN-123" };

function messageEvent(overrides: Partial<WhatsAppParsedEvent> = {}): WhatsAppParsedEvent {
  return { kind: "message", id: "wamid.x", from: "+265991234567", inputType: "text", text: "hi", accountId: "WABA-999", phoneNumberId: "PN-123", ...overrides } as WhatsAppParsedEvent;
}

test("partitionEventsByAccount keeps only events matching both identifiers", () => {
  const events = [
    messageEvent({ id: "match" }),
    messageEvent({ id: "wrong-waba", accountId: "WABA-OTHER" }),
    messageEvent({ id: "wrong-pn", phoneNumberId: "PN-OTHER" }),
    { kind: "status", id: "status-match", status: "delivered", accountId: "WABA-999", phoneNumberId: "PN-123" } as WhatsAppParsedEvent,
  ];
  const { accepted, rejected } = partitionEventsByAccount(events, EXPECTED);
  assert.deepEqual(accepted.map((event) => event.id), ["match", "status-match"]);
  assert.equal(rejected, 2);
});

test("partitionEventsByAccount rejects events with missing identifiers", () => {
  const { accepted, rejected } = partitionEventsByAccount([messageEvent({ accountId: undefined, phoneNumberId: undefined })], EXPECTED);
  assert.equal(accepted.length, 0);
  assert.equal(rejected, 1);
});

test("partitionEventsByAccount rejects everything when configuration is blank", () => {
  const { accepted, rejected } = partitionEventsByAccount([messageEvent()], { wabaId: "", phoneNumberId: "" });
  assert.equal(accepted.length, 0);
  assert.equal(rejected, 1);
});
