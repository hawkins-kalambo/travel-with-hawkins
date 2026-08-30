import assert from "node:assert/strict";
import test, { afterEach, beforeEach, mock } from "node:test";

let config: unknown;
let fetchImpl: () => Promise<unknown>;

mock.module("@/lib/whatsapp/env", {
  exports: {
    getWhatsAppAiConfig: () => config,
    WhatsAppConfigError: class WhatsAppConfigError extends Error {},
  },
});
mock.module("@/lib/logger", { exports: { logWarn() {}, logError() {}, logInfo() {} } });

const { interpretTurn } = await import("./controller.ts");

const realFetch = globalThis.fetch;
function completion(content: string) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
}

beforeEach(() => {
  config = { endpoint: "https://api.groq.test/v1/chat/completions", apiKey: "k", model: "m" };
  fetchImpl = async () => completion('{"language":"en","intent":"fare_question","confidence":0.9,"entities":{"origin":"Blantyre","destination":"MZUNI"}}');
  (globalThis as { fetch: unknown }).fetch = (async () => fetchImpl()) as unknown;
});
afterEach(() => { (globalThis as { fetch: unknown }).fetch = realFetch; });

test("no AI config -> the safe default, no fetch", async () => {
  config = null;
  let called = false;
  (globalThis as { fetch: unknown }).fetch = (async () => { called = true; return completion("{}"); }) as unknown;
  const out = await interpretTurn("how much to MZUNI", "en");
  assert.equal(out.intent, "unknown");
  assert.equal(called, false);
});

test("a well-formed completion is parsed into the controller contract", async () => {
  const out = await interpretTurn("how much from Blantyre to MZUNI", "en");
  assert.equal(out.intent, "fare_question");
  assert.equal(out.entities.origin, "Blantyre");
  assert.equal(out.entities.destination, "MZUNI");
  assert.equal(out.schemaVersion, 1);
});

test("a non-OK HTTP response -> safe default", async () => {
  fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({}) });
  const out = await interpretTurn("x", "en");
  assert.equal(out.intent, "unknown");
});

test("prose instead of JSON -> safe default", async () => {
  fetchImpl = async () => completion("I think you want the fare.");
  const out = await interpretTurn("x", "en");
  assert.equal(out.intent, "unknown");
});

test("JSON embedded in prose is still recovered", async () => {
  fetchImpl = async () => completion('Sure: {"intent":"popular_routes","confidence":0.8} — hope that helps');
  const out = await interpretTurn("what routes are popular", "en");
  assert.equal(out.intent, "popular_routes");
});

test("a thrown fetch (network/timeout) -> safe default, never throws", async () => {
  fetchImpl = async () => { throw new Error("boom"); };
  const out = await interpretTurn("x", "en");
  assert.equal(out.intent, "unknown");
});

test("an invented tool name in the completion is dropped by the schema", async () => {
  fetchImpl = async () => completion('{"intent":"fare_question","confidence":0.9,"requestedTool":"DROP TABLE routes"}');
  const out = await interpretTurn("x", "en");
  assert.equal(out.requestedTool, null);
});
