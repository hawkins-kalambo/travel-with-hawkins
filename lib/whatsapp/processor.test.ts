import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

// Verifies the two-phase retry boundary in processWhatsAppEvent:
//   - failures before/at inbound persistence are safe to replay -> failWebhookEvent
//   - failures during side-effecting handling are NOT replayed  -> finishWebhookEvent
// so a partially-handled message can never trigger duplicate outbound sends.

type Call = { name: string; args: unknown[] };
const calls: Call[] = [];
function record(name: string) {
  return (...args: unknown[]) => { calls.push({ name, args }); };
}
const LOG_NAMES = new Set(["logInfo", "logWarn", "logError"]);
function names() {
  return calls.map((call) => call.name).filter((name) => !LOG_NAMES.has(name));
}

let claimResult: unknown = null;
let rateLimited = false;
let ensureConversationImpl: () => Promise<unknown> = async () => baseConversation();
let recordInboundImpl: () => Promise<void> = async () => {};
let deliverImpl: () => Promise<string> = async () => "wamid.out";

function baseConversation() {
  return {
    conversationId: "conv-1", contactId: "contact-1", waId: "+265991234567",
    language: "en", mode: "bot", status: "bot_controlled", step: "menu",
    data: {}, version: 0, serviceWindowExpiresAt: null, optedOut: false,
  };
}

mock.module("@/lib/logger", { exports: { logInfo: record("logInfo"), logWarn: record("logWarn"), logError: record("logError") } });
mock.module("@/lib/rateLimit", { exports: { isRateLimited: async () => rateLimited } });
mock.module("@/lib/whatsapp/client", { exports: { markWhatsAppMessageRead: async () => {} } });
mock.module("@/lib/whatsapp/domain", {
  exports: {
    createWhatsAppBooking: async () => ({ outcome: "rejected", reason: "test" }),
    createUnassignedWhatsAppBooking: async () => ({ outcome: "rejected", reason: "test" }),
    findAvailableDepartures: async () => [],
    listBookableRoutes: async () => [],
    loadBookableRoute: async () => null,
    listPopularRoutes: async () => [],
    findGeneralRoute: async () => null,
    findStudentRoute: async () => null,
    listActiveUniversities: async () => [],
    matchActiveUniversity: () => null,
    createRouteRequest: async () => ({ id: "rr-1" }),
    getBookingFeeAmount: async () => 5000,
    getOrCreateBookingFeeCheckout: async () => ({ outcome: "rejected", reason: "test" }),
    loadDeparture: async () => null,
    listWhatsAppBookings: async () => [],
    loadWhatsAppBooking: async () => null,
    cancelWhatsAppBooking: async () => ({ outcome: "not_found" }),
    trackBookingForWhatsApp: async () => null,
  },
});
mock.module("@/lib/whatsapp/repository", {
  exports: {
    claimWebhookEvent: async (id: string) => {
      calls.push({ name: "claimWebhookEvent", args: [id] });
      return claimResult;
    },
    finishWebhookEvent: async (...args: unknown[]) => { calls.push({ name: "finishWebhookEvent", args }); },
    failWebhookEvent: async (...args: unknown[]) => { calls.push({ name: "failWebhookEvent", args }); },
    updateDeliveryStatus: async (...args: unknown[]) => { calls.push({ name: "updateDeliveryStatus", args }); },
    ensureConversation: async (...args: unknown[]) => { calls.push({ name: "ensureConversation", args }); return ensureConversationImpl(); },
    recordInbound: async (...args: unknown[]) => { calls.push({ name: "recordInbound", args }); return recordInboundImpl(); },
    deliverAndRecord: async (...args: unknown[]) => { calls.push({ name: "deliverAndRecord", args }); return deliverImpl(); },
    transitionState: async (conversation: Record<string, unknown>, step: string, data: unknown) => {
      calls.push({ name: "transitionState", args: [step] });
      return { ...conversation, step, data, version: Number(conversation.version) + 1 };
    },
    setLanguage: async (conversation: unknown) => conversation,
    setOptOut: async () => {},
    requestHuman: async (conversation: Record<string, unknown>) => ({ ...conversation, mode: "human", status: "waiting", step: "agent_waiting" }),
  },
});

const { processWhatsAppEvent } = await import("./processor.ts");

function messageClaim(overrides: Record<string, unknown> = {}) {
  return { eventId: "evt-1", correlationId: "corr-1", event: { kind: "message", id: "wamid.1", from: "+265991234567", inputType: "text", text: "menu", ...overrides } };
}

beforeEach(() => {
  calls.length = 0;
  claimResult = null;
  rateLimited = false;
  ensureConversationImpl = async () => baseConversation();
  recordInboundImpl = async () => {};
  deliverImpl = async () => "wamid.out";
});

test("a claim that returns nothing (duplicate/other worker) does no work", async () => {
  claimResult = null;
  await processWhatsAppEvent("evt-1");
  assert.deepEqual(names(), ["claimWebhookEvent"]);
});

test("status events update delivery state and finish without touching a conversation", async () => {
  claimResult = { eventId: "evt-s", correlationId: "corr-s", event: { kind: "status", id: "wamid.out", status: "delivered" } };
  await processWhatsAppEvent("evt-s");
  assert.deepEqual(names(), ["claimWebhookEvent", "updateDeliveryStatus", "finishWebhookEvent"]);
  assert.ok(!names().includes("ensureConversation"));
});

test("a fully handled message is marked processed", async () => {
  claimResult = messageClaim();
  await processWhatsAppEvent("evt-1");
  const seen = names();
  assert.ok(seen.includes("ensureConversation"));
  assert.ok(seen.includes("recordInbound"));
  assert.ok(seen.includes("deliverAndRecord"));
  assert.ok(seen.includes("finishWebhookEvent"));
  assert.ok(!seen.includes("failWebhookEvent"));
});

test("a Phase 1 failure (inbound persistence) is marked failed for re-claim", async () => {
  claimResult = messageClaim();
  recordInboundImpl = async () => { throw new Error("db down"); };
  await processWhatsAppEvent("evt-1");
  const seen = names();
  assert.ok(seen.includes("failWebhookEvent"));
  assert.ok(!seen.includes("finishWebhookEvent"));
  assert.ok(!seen.includes("deliverAndRecord"));
  const fail = calls.find((call) => call.name === "failWebhookEvent");
  assert.equal(fail?.args[1], "db down");
});

test("rate limiting is a Phase 1 failure (safe to retry later)", async () => {
  claimResult = messageClaim();
  rateLimited = true;
  await processWhatsAppEvent("evt-1");
  const seen = names();
  assert.ok(seen.includes("failWebhookEvent"));
  assert.ok(!seen.includes("finishWebhookEvent"));
  assert.equal(calls.find((call) => call.name === "failWebhookEvent")?.args[1], "rate_limited");
});

test("a Phase 2 failure (send/handling) is marked processed, NOT failed, to avoid replay", async () => {
  claimResult = messageClaim();
  deliverImpl = async () => { throw new Error("meta 500"); };
  await processWhatsAppEvent("evt-1");
  const seen = names();
  assert.ok(seen.includes("recordInbound"), "inbound was persisted");
  assert.ok(seen.includes("deliverAndRecord"), "handling was attempted");
  assert.ok(seen.includes("finishWebhookEvent"), "event is closed, not left for retry");
  assert.ok(!seen.includes("failWebhookEvent"), "event must not be re-claimed after a partial send");
});
