import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

// composeLiveAnswer never calls a model — it only shapes VERIFIED tool
// results. runTool is mocked to return canned data per tool name.

let toolResults: Record<string, unknown>;

mock.module("@/lib/whatsapp/ai/tools", {
  exports: {
    runTool: async (name: string) => {
      if (name in toolResults) {
        const v = toolResults[name];
        if (v && typeof v === "object" && "__error" in (v as object)) {
          return { ok: false, error: (v as { __error: string }).__error, message: "x" };
        }
        return { ok: true, data: v };
      }
      return { ok: false, error: "not_found", message: "no data" };
    },
  },
});

const { composeLiveAnswer } = await import("./respond.ts");

const CTX = { contactId: "c-1", waId: "+265991234567" };
function controller(intent: string, entities: Record<string, unknown> = {}) {
  return { schemaVersion: 1, language: "en", intent, confidence: 0.9, entities, missingFields: [], requestedTool: null, requiresConfirmation: false, requiresHuman: false, urgency: "normal" } as never;
}

const mzuni = { routeId: "r1", label: "Blantyre - Mzuzu University", origin: "Blantyre", destination: "Mzuzu University", pickup: "Depot", fare: 120000, priced: true, universityShortCode: "MZUNI" };

beforeEach(() => {
  toolResults = {
    searchActiveRoutes: [mzuni],
    listPopularRoutes: [mzuni],
    listActiveUniversities: [{ name: "Mzuzu University", shortCode: "MZUNI" }],
    findScheduledTrips: [],
    getCustomerBookings: [{ bookingId: "BK-1", routeLabel: "Blantyre - MZUNI", travelDate: "2026-09-01", status: "Booked", bookingFeeStatus: "unpaid" }],
    getCustomerPaymentStatus: { status: "Booked", bookingFeeStatus: "unpaid", fareStatus: "unpaid" },
    calculateBookingFeeDeadline: { deadline: "2026-08-31 18:00 Malawi time", bookingFeeStatus: "unpaid" },
    getCustomerBooking: { bookingId: "BK-1", routeLabel: "Blantyre - MZUNI", travelDate: "2026-09-01", status: "Booked", bookingFeeStatus: "unpaid", fareStatus: "unpaid" },
  };
});

test("fare question with a resolvable route quotes the verified fare", async () => {
  const r = await composeLiveAnswer(controller("fare_question", { origin: "Blantyre", destination: "MZUNI" }), CTX, "en");
  assert.match(r.text ?? "", /current fare for Blantyre - Mzuzu University is MWK 120,000/);
  assert.equal(r.toolOutcome, "ok");
});

test("fare question with no origin asks a specific clarification, sends no fare", async () => {
  const r = await composeLiveAnswer(controller("fare_question", {}), CTX, "en");
  assert.equal(r.text, null);
  assert.match(r.needsClarification ?? "", /travelling from/i);
});

test("route not found -> a 'request that route' nudge, never an invented fare", async () => {
  toolResults.searchActiveRoutes = [];
  const r = await composeLiveAnswer(controller("fare_question", { origin: "Nowhere", destination: "MZUNI" }), CTX, "en");
  assert.match(r.text ?? "", /couldn't find an active route/i);
  assert.doesNotMatch(r.text ?? "", /MWK/);
});

test("schedule question with a date reports a real trip or the honest 'not scheduled yet'", async () => {
  let r = await composeLiveAnswer(controller("schedule_question", { origin: "Blantyre", destination: "MZUNI", travelDate: "2026-09-01" }), CTX, "en");
  assert.match(r.text ?? "", /haven't scheduled a trip for 2026-09-01/i);

  toolResults.findScheduledTrips = [{ departureTime: "07:30:00", pickup: "Depot Gate" }];
  r = await composeLiveAnswer(controller("schedule_question", { origin: "Blantyre", destination: "MZUNI", travelDate: "2026-09-01" }), CTX, "en");
  assert.match(r.text ?? "", /trip on 2026-09-01 at 07:30/);
});

test("my bookings lists the verified rows", async () => {
  const r = await composeLiveAnswer(controller("my_bookings"), CTX, "en");
  assert.match(r.text ?? "", /BK-1 — Blantyre - MZUNI, 2026-09-01 \(Booked, fee unpaid\)/);
});

test("my bookings, unauthorized sender -> null text (caller falls back)", async () => {
  toolResults.getCustomerBookings = { __error: "not_authorized" };
  const r = await composeLiveAnswer(controller("my_bookings"), { contactId: null, waId: "+265991234567" }, "en");
  assert.equal(r.text, null);
  assert.equal(r.toolOutcome, "denied");
});

test("payment status reports verified status, never trusts a claim", async () => {
  const r = await composeLiveAnswer(controller("payment_status", { bookingId: "BK-1" }), CTX, "en");
  assert.match(r.text ?? "", /has not confirmed the booking fee yet/i);

  toolResults.getCustomerPaymentStatus = { status: "Booked", bookingFeeStatus: "paid", fareStatus: "unpaid" };
  const r2 = await composeLiveAnswer(controller("payment_status", { bookingId: "BK-1" }), CTX, "en");
  assert.match(r2.text ?? "", /confirmed as paid/i);
});

test("payment status with no booking reference asks for it", async () => {
  const r = await composeLiveAnswer(controller("payment_status", {}), CTX, "en");
  assert.equal(r.text, null);
  assert.match(r.needsClarification ?? "", /booking reference/i);
});

test("booking deadline reports the verified deadline", async () => {
  const r = await composeLiveAnswer(controller("booking_deadline", { bookingId: "BK-1" }), CTX, "en");
  assert.match(r.text ?? "", /pay the booking fee by 2026-08-31 18:00 Malawi time/i);
});

test("an intent with no live handler returns null (no reply)", async () => {
  const r = await composeLiveAnswer(controller("luggage_question"), CTX, "en");
  assert.equal(r.text, null);
  assert.equal(r.toolOutcome, "none");
});
