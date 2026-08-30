import assert from "node:assert/strict";
import test, { afterEach, beforeEach, mock } from "node:test";

let config: unknown;
let reply: string;

mock.module("@/lib/whatsapp/env", {
  exports: { getWhatsAppAiConfig: () => config, WhatsAppConfigError: class extends Error {} },
});
mock.module("@/lib/logger", { exports: { logWarn() {}, logError() {}, logInfo() {} } });
// Avoid pulling the whole domain/tools chain — only renderPack is used.
mock.module("@/lib/whatsapp/ai/respond", {
  exports: { renderPack: (p: { facts: { label: string; value: string }[] }) => p.facts.map((f) => `- ${f.label}: ${f.value}`).join("\n") },
});

const { synthesiseReply } = await import("./synthesise.ts");

const realFetch = globalThis.fetch;
function pack(facts: { label: string; value: string }[]) {
  return { intent: "fare_question", facts, allowedTool: null, toolOutcome: "ok", route: null, trip: null, popular: [], universities: [], bookings: [], booking: null, payment: null, deadline: null } as never;
}

beforeEach(() => {
  config = { endpoint: "https://api.test/v1/chat/completions", apiKey: "k", model: "m" };
  reply = "The fare is MWK 120,000. Choose Make a Booking to reserve.";
  (globalThis as { fetch: unknown }).fetch = (async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: reply } }] }) })) as unknown;
});
afterEach(() => { (globalThis as { fetch: unknown }).fetch = realFetch; });

test("empty fact pack -> no call, null text", async () => {
  let called = false;
  (globalThis as { fetch: unknown }).fetch = (async () => { called = true; return { ok: true, json: async () => ({}) }; }) as unknown;
  const r = await synthesiseReply("how much", "en", pack([]), []);
  assert.equal(r.text, null);
  assert.equal(called, false);
});

test("no AI config -> null text, no call", async () => {
  config = null;
  const r = await synthesiseReply("how much", "en", pack([{ label: "fare", value: "MWK 120,000" }]));
  assert.equal(r.text, null);
});

test("a reply whose numbers are all in the pack is accepted", async () => {
  reply = "The Blantyre - MZUNI fare is MWK 120,000. There is no trip on 2027-06-20 yet.";
  const r = await synthesiseReply("...", "en", pack([
    { label: "route", value: "Blantyre - MZUNI" },
    { label: "fare", value: "MWK 120,000" },
    { label: "requested date", value: "2027-06-20" },
    { label: "scheduled trip", value: "none scheduled for that date" },
  ]));
  assert.match(r.text ?? "", /MWK 120,000/);
  assert.equal(r.guardTripped, false);
});

test("a reply that invents a price is rejected (guard trips)", async () => {
  reply = "The fare is MWK 95,000.";
  const r = await synthesiseReply("how much", "en", pack([{ label: "fare", value: "MWK 120,000" }]));
  assert.equal(r.text, null);
  assert.equal(r.guardTripped, true);
});

test("a reply that invents a date is rejected", async () => {
  reply = "Your trip is on 2027-07-01.";
  const r = await synthesiseReply("when", "en", pack([{ label: "requested date", value: "2027-06-20" }]));
  assert.equal(r.guardTripped, true);
});

test("a reply that invents a booking reference is rejected", async () => {
  reply = "I can see booking BK-ZZZ99999 is paid.";
  const r = await synthesiseReply("status", "en", pack([{ label: "booking", value: "BK-AAA11111" }]));
  assert.equal(r.guardTripped, true);
});

test("a reply that leaks 'as an AI language model' is rejected", async () => {
  reply = "As an AI language model I cannot be sure, but the fare is MWK 120,000.";
  const r = await synthesiseReply("how much", "en", pack([{ label: "fare", value: "MWK 120,000" }]));
  assert.equal(r.text, null);
  assert.equal(r.guardTripped, true);
});

test("a non-OK HTTP response -> null text, guard not tripped", async () => {
  (globalThis as { fetch: unknown }).fetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown;
  const r = await synthesiseReply("how much", "en", pack([{ label: "fare", value: "MWK 120,000" }]));
  assert.equal(r.text, null);
  assert.equal(r.guardTripped, false);
});

test("a thrown fetch -> null text, never throws", async () => {
  (globalThis as { fetch: unknown }).fetch = (async () => { throw new Error("boom"); }) as unknown;
  const r = await synthesiseReply("how much", "en", pack([{ label: "fare", value: "MWK 120,000" }]));
  assert.equal(r.text, null);
});

test("word-count style small numbers in prose don't trip the guard when in the pack", async () => {
  reply = "You have 2 bookings on this number. Open My Bookings for the full list.";
  const r = await synthesiseReply("my bookings", "en", pack([{ label: "booking", value: "BK-1 — X, 2026-09-01" }, { label: "booking", value: "BK-2 — Y, 2026-09-05" }, { label: "count", value: "2" }]));
  assert.equal(r.guardTripped, false);
});
