import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

// The registry only ever reads through @/lib/whatsapp/domain and
// @/lib/whatsapp/knowledge; both are mocked so we exercise the gating logic.

let bookableRoutes: unknown[];
let popular: unknown[];
let oneRoute: unknown;
let universities: unknown[];
let customerBookings: unknown[];
let customerBooking: unknown;
let departure: unknown;

mock.module("@/lib/whatsapp/domain", {
  exports: {
    listBookableRoutes: async () => bookableRoutes,
    listPopularRoutes: async () => popular,
    loadBookableRoute: async () => oneRoute,
    listActiveUniversities: async () => universities,
    matchActiveUniversity: (value: string, unis: Array<{ name: string; shortCode: string | null }>) =>
      unis.find((u) => u.name.toLowerCase() === String(value).toLowerCase() || u.shortCode?.toLowerCase() === String(value).toLowerCase()) ?? null,
    listWhatsAppBookings: async () => customerBookings,
    loadWhatsAppBooking: async () => customerBooking,
    findDepartureForRouteDate: async () => departure,
  },
});
mock.module("@/lib/whatsapp/ai/knowledgeStore", {
  exports: {
    searchKnowledge: async (q: string) => q.includes("fee")
      ? { source: "table", id: "k-1", topic: "Booking fee", answer: "The booking fee is separate.", language: "en", requiresLiveData: false }
      : { source: "none", outcome: "unknown" },
  },
});

const { runTool, listRegisteredTools } = await import("./tools.ts");

const ASSIST_ONLY = { WHATSAPP_AI_ASSISTANT_ENABLED: "true" } as unknown as NodeJS.ProcessEnv;
const LIVE = { WHATSAPP_AI_ASSISTANT_ENABLED: "true", WHATSAPP_AI_LIVE_TOOLS_ENABLED: "true" } as unknown as NodeJS.ProcessEnv;

const verified = { contactId: "c-1", waId: "+265991234567" };
const anon = { contactId: null, waId: "+265991234567" };

beforeEach(() => {
  bookableRoutes = [{ routeId: "r1", label: "Lilongwe - Mzuzu University", origin: "Lilongwe", destination: "Mzuzu University", pickup: "Depot", fare: 15000, priced: true, routeType: "student", universityShortCode: "MZUNI" }];
  popular = [...bookableRoutes];
  oneRoute = bookableRoutes[0];
  universities = [{ id: "u1", name: "Mzuzu University", shortCode: "MZUNI" }];
  customerBookings = [{ bookingId: "BK-1", routeLabel: "Lilongwe - MZUNI", travelDate: "2026-09-01", status: "Booked", bookingFeeStatus: "unpaid", fareStatus: "unpaid", expiresAt: "2026-08-31T00:00:00Z" }];
  customerBooking = customerBookings[0];
  departure = null;
});

test("every declared permission has a registry entry and vice versa", async () => {
  const { AI_TOOL_PERMISSIONS } = await import("./permissions.ts");
  assert.deepEqual(listRegisteredTools().sort(), Object.keys(AI_TOOL_PERMISSIONS).sort());
});

test("an unknown tool name is rejected", async () => {
  const r = await runTool("doWhateverIWant", verified, {}, { env: LIVE });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.error, "unknown_tool");
});

test("with the assistant disabled, nothing runs", async () => {
  const r = await runTool("listPopularRoutes", verified, {}, { env: {} as NodeJS.ProcessEnv });
  assert.equal(r.ok === false && r.error, "feature_disabled");
});

test("a live-data tool needs the liveTools flag", async () => {
  assert.equal((await runTool("listPopularRoutes", verified, {}, { env: ASSIST_ONLY })).ok, false);
  const r = await runTool("listPopularRoutes", verified, {}, { env: LIVE });
  assert.equal(r.ok, true);
  assert.equal(r.ok && (r.data as unknown[]).length, 1);
});

test("searchApprovedKnowledge runs on the assistant flag alone (no liveTools needed)", async () => {
  const r = await runTool("searchApprovedKnowledge", anon, { question: "is the fee separate" }, { env: ASSIST_ONLY });
  assert.equal(r.ok, true);
  assert.equal(r.ok && (r.data as { source: string }).source, "table");
});

test("a customer-scoped tool refuses an unverified sender", async () => {
  const r = await runTool("getCustomerBookings", anon, {}, { env: LIVE });
  assert.equal(r.ok === false && r.error, "not_authorized");
});

test("a customer-scoped tool returns the verified sender's own data", async () => {
  const r = await runTool("getCustomerBookings", verified, {}, { env: LIVE });
  assert.equal(r.ok, true);
  assert.equal(r.ok && (r.data as unknown[]).length, 1);
});

test("getCustomerPaymentStatus returns only status fields, never a secret", async () => {
  const r = await runTool("getCustomerPaymentStatus", verified, { bookingId: "BK-1" }, { env: LIVE });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.ok ? (r.data as object) : {}).sort(), ["bookingFeeStatus", "fareStatus", "status"]);
});

test("invalid input is rejected before the tool runs", async () => {
  const r = await runTool("getRouteDetails", verified, { routeId: "" }, { env: LIVE });
  assert.equal(r.ok === false && r.error, "invalid_input");
});

test("confirmBookingDraft demands a server confirmation token", async () => {
  const draftEnv = { ...LIVE, WHATSAPP_AI_BOOKING_DRAFTS_ENABLED: "true" } as unknown as NodeJS.ProcessEnv;
  const r = await runTool("confirmBookingDraft", verified, {}, { env: draftEnv });
  assert.equal(r.ok === false && r.error, "confirmation_required");
});

test("a not-found lookup is a structured error, not a throw", async () => {
  oneRoute = null;
  const r = await runTool("getRouteDetails", verified, { routeId: "missing" }, { env: LIVE });
  assert.equal(r.ok === false && r.error, "not_found");
});

test("findScheduledTrips returns [] when no trip is published for the date", async () => {
  const r = await runTool("findScheduledTrips", verified, { routeId: "r1", travelDate: "2026-09-01" }, { env: LIVE });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok ? r.data : null, []);
});
