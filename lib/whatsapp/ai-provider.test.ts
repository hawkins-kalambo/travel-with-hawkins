import assert from "node:assert/strict";
import test, { afterEach, beforeEach, mock } from "node:test";

// The provider is exercised with a mocked global fetch; no real network calls.

mock.module("@/lib/logger", { exports: { logInfo() {}, logWarn() {}, logError() {} } });

const { getWhatsAppAiProvider } = await import("./ai-provider.ts");

const realFetch = globalThis.fetch;
let lastRequest: { url: string; body: Record<string, unknown> } | null = null;
let fetchImpl: () => Promise<Response>;

function completion(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  process.env.WHATSAPP_AI_PROVIDER = "groq";
  process.env.WHATSAPP_AI_BASE_URL = "https://api.groq.com/openai/v1";
  process.env.WHATSAPP_AI_API_KEY = "test-key";
  process.env.WHATSAPP_AI_MODEL = "openai/gpt-oss-20b";
  lastRequest = null;
  fetchImpl = async () => completion('{"intent":"routes","origin":"Lilongwe","destination":"Mzuzu","clarify":false}');
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    lastRequest = { url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} };
    return fetchImpl();
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

// ---- configuration -------------------------------------------------------

test("blank provider -> AI disabled (null)", () => {
  process.env.WHATSAPP_AI_PROVIDER = "";
  assert.equal(getWhatsAppAiProvider(), null);
});

test("provider set but key missing -> disabled gracefully (no throw)", () => {
  delete process.env.WHATSAPP_AI_API_KEY;
  assert.equal(getWhatsAppAiProvider(), null);
});

test("unknown provider value -> disabled gracefully", () => {
  process.env.WHATSAPP_AI_PROVIDER = "openai";
  assert.equal(getWhatsAppAiProvider(), null);
});

test("base URL gets /chat/completions appended exactly once", async () => {
  await getWhatsAppAiProvider()!.interpret("hi", "en");
  assert.equal(lastRequest?.url, "https://api.groq.com/openai/v1/chat/completions");
});

test("a full endpoint URL is not doubled up", async () => {
  process.env.WHATSAPP_AI_BASE_URL = "https://api.groq.com/openai/v1/chat/completions/";
  await getWhatsAppAiProvider()!.interpret("hi", "en");
  assert.equal(lastRequest?.url, "https://api.groq.com/openai/v1/chat/completions");
});

test("request is bounded and carries no history: json mode, temp 0, capped tokens, single message", async () => {
  await getWhatsAppAiProvider()!.interpret("x".repeat(5000), "en");
  const b = lastRequest!.body;
  assert.deepEqual(b.response_format, { type: "json_object" });
  assert.equal(b.temperature, 0);
  assert.ok(Number(b.max_tokens) <= 256);
  assert.equal((b.messages as unknown[]).length, 2, "system + one user message only");
  const userMsg = (b.messages as Array<{ role: string; content: string }>)[1];
  assert.ok(userMsg.content.length < 600, "input is truncated");
  assert.match(userMsg.content, /^Language: en\. Message: /);
});

// ---- valid / ambiguous output -----------------------------------------

test("valid interpretation is parsed and returned", async () => {
  const out = await getWhatsAppAiProvider()!.interpret("I want to go from Lilongwe to Mzuzu", "en");
  assert.deepEqual(out, { intent: "routes", origin: "Lilongwe", destination: "Mzuzu", travelDate: undefined, answer: undefined, clarify: false });
});

test("ambiguous output is passed through as clarify", async () => {
  fetchImpl = async () => completion('{"intent":"unknown","clarify":true}');
  const out = await getWhatsAppAiProvider()!.interpret("hmm", "en");
  assert.equal(out.intent, "unknown");
  assert.equal(out.clarify, true);
});

test("an approved-style answer is kept; a price-like answer is dropped", async () => {
  fetchImpl = async () => completion('{"intent":"question","answer":"The booking fee is separate from the fare.","clarify":false}');
  assert.equal((await getWhatsAppAiProvider()!.interpret("q", "en")).answer, "The booking fee is separate from the fare.");
  fetchImpl = async () => completion('{"intent":"routes","answer":"Lilongwe to Mzuzu is MWK 12000","clarify":false}');
  assert.equal((await getWhatsAppAiProvider()!.interpret("q", "en")).answer, undefined);
});

test("an over-long answer is dropped", async () => {
  fetchImpl = async () => completion(JSON.stringify({ intent: "question", answer: "a".repeat(600), clarify: false }));
  assert.equal((await getWhatsAppAiProvider()!.interpret("q", "en")).answer, undefined);
});

test("an out-of-vocabulary intent collapses to unknown", async () => {
  fetchImpl = async () => completion('{"intent":"DROP TABLE bookings","clarify":false}');
  const out = await getWhatsAppAiProvider()!.interpret("do bad thing", "en");
  assert.equal(out.intent, "unknown");
  assert.equal(out.clarify, true);
});

test("a bad travelDate is discarded", async () => {
  fetchImpl = async () => completion('{"intent":"routes","travelDate":"next friday","clarify":false}');
  assert.equal((await getWhatsAppAiProvider()!.interpret("q", "en")).travelDate, undefined);
});

// ---- failure modes: never throw, always a safe default ----------------

test("malformed (non-JSON) output -> safe default", async () => {
  fetchImpl = async () => completion("Sorry, I can't do that.");
  assert.deepEqual(await getWhatsAppAiProvider()!.interpret("q", "en"), { intent: "unknown", clarify: true });
});

test("JSON embedded in prose is still recovered", async () => {
  fetchImpl = async () => completion('Here: {"intent":"tracking","clarify":false} done');
  assert.equal((await getWhatsAppAiProvider()!.interpret("q", "en")).intent, "tracking");
});

for (const status of [400, 401, 404, 429, 500]) {
  test(`HTTP ${status} from the provider -> safe default`, async () => {
    fetchImpl = async () => new Response("nope", { status });
    assert.deepEqual(await getWhatsAppAiProvider()!.interpret("q", "en"), { intent: "unknown", clarify: true });
  });
}

test("timeout (AbortError) -> safe default", async () => {
  fetchImpl = async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); };
  assert.deepEqual(await getWhatsAppAiProvider()!.interpret("q", "en"), { intent: "unknown", clarify: true });
});

test("network error -> safe default", async () => {
  fetchImpl = async () => { throw new Error("ECONNRESET"); };
  assert.deepEqual(await getWhatsAppAiProvider()!.interpret("q", "en"), { intent: "unknown", clarify: true });
});

// ---- language ---------------------------------------------------------
// NOTE: Chichewa understanding quality is NOT verified here (the model is
// mocked). Flagged for human review before enabling AI for ny customers.

test("Chichewa input is labelled and forwarded", async () => {
  fetchImpl = async () => completion('{"intent":"routes","destination":"Mzuzu","clarify":false}');
  const out = await getWhatsAppAiProvider()!.interpret("Moni, ndikufuna kupita ku Mzuzu", "ny");
  assert.equal(out.intent, "routes");
  assert.match((lastRequest!.body.messages as Array<{ content: string }>)[1].content, /^Language: ny\. /);
});
