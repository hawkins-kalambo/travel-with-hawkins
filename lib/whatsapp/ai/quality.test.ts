import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Phase A2 regression harness: run realistic turns through the deterministic
// pipeline (gatherFacts -> formatFromPack) against a FIXED catalogue and
// assert safety properties — no invented numbers, right tool, sensible
// clarification / fallback. Guards tuning of the composer.

const ROUTES: Record<string, unknown> = {
  "blantyre|mzuzu university": [{ routeId: "r-mzuni", label: "Blantyre - Mzuzu University", origin: "Blantyre", destination: "Mzuzu University", pickup: "Blantyre Depot", fare: 120000, priced: true, universityShortCode: "MZUNI" }],
  "lilongwe|blantyre": [{ routeId: "r-lb", label: "Lilongwe - Blantyre", origin: "Lilongwe", destination: "Blantyre", pickup: "Lilongwe Bus Rank", fare: 18000, priced: true, universityShortCode: null }],
  "salima|mzuzu university": [], // not run
};
const POPULAR = ROUTES["blantyre|mzuzu university"];
const UNIS = [{ name: "Mzuzu University", shortCode: "MZUNI" }, { name: "Kamuzu University of Health Sciences", shortCode: "KUHeS" }];
const BOOKINGS = [{ bookingId: "BK-AAA11111", routeLabel: "Blantyre - MZUNI", travelDate: "2027-06-20", status: "Booked", bookingFeeStatus: "unpaid", fareStatus: "unpaid" }];

mock.module("@/lib/whatsapp/ai/tools", {
  exports: {
    runTool: async (name: string, _ctx: unknown, input: Record<string, unknown>) => {
      if (name === "searchActiveRoutes") {
        const key = `${String(input.origin).toLowerCase()}|${String(input.destination).toLowerCase()}`;
        return { ok: true, data: ROUTES[key] ?? [] };
      }
      if (name === "listPopularRoutes") return { ok: true, data: POPULAR };
      if (name === "listActiveUniversities") return { ok: true, data: UNIS };
      if (name === "resolveUniversity") return String(input.input).toLowerCase().includes("mzuni") ? { ok: true, data: UNIS[0] } : { ok: false, error: "not_found", message: "x" };
      if (name === "findScheduledTrips") return { ok: true, data: [] };
      if (name === "getCustomerBookings") return { ok: true, data: BOOKINGS };
      if (name === "getCustomerBooking") return input.bookingId === "BK-AAA11111" ? { ok: true, data: BOOKINGS[0] } : { ok: false, error: "not_found", message: "x" };
      if (name === "getCustomerPaymentStatus") return input.bookingId === "BK-AAA11111" ? { ok: true, data: { status: "Booked", bookingFeeStatus: "unpaid", fareStatus: "unpaid" } } : { ok: false, error: "not_found", message: "x" };
      if (name === "calculateBookingFeeDeadline") return input.bookingId === "BK-AAA11111" ? { ok: true, data: { deadline: "2027-06-15 18:00 Malawi time", bookingFeeStatus: "unpaid" } } : { ok: false, error: "not_found", message: "x" };
      return { ok: false, error: "tool_error", message: "unmapped" };
    },
  },
});

const { gatherFacts, formatFromPack, renderPack } = await import("./respond.ts");

const CTX = { contactId: "c-1", waId: "+265991234567" };
function controller(intent: string, entities: Record<string, unknown> = {}) {
  return { schemaVersion: 1, language: "en", intent, confidence: 0.9, entities, missingFields: [], requestedTool: null, requiresConfirmation: false, requiresHuman: false, urgency: "normal" } as never;
}

// Every number/amount/date in the reply must be traceable to the fact pack.
function noInventedFacts(reply: string, packText: string) {
  const hay = packText.replace(/\s+/g, "").toLowerCase();
  for (const re of [/mwk\s*[\d,]+/gi, /\b\d{4}-\d{2}-\d{2}\b/g, /\bBK-[A-Z0-9-]{3,}\b/gi, /\b\d{3,}\b/g]) {
    for (const m of reply.matchAll(re)) {
      const tok = m[0].replace(/\s+/g, "").toLowerCase();
      const digits = tok.replace(/[^\d]/g, "");
      assert.ok(hay.includes(tok) || (digits && hay.replace(/[^\d]/g, "").includes(digits)), `invented "${m[0]}" not in pack:\n${packText}`);
    }
  }
}

const CASES: { name: string; c: ReturnType<typeof controller>; expect: (r: ReturnType<typeof formatFromPack>, packText: string) => void }[] = [
  {
    name: "fare, resolvable route -> quotes only the catalogue fare",
    c: controller("fare_question", { origin: "Blantyre", destination: "Mzuzu University" }),
    expect: (r, p) => { assert.match(r.text ?? "", /MWK 120,000/); noInventedFacts(r.text!, p); assert.equal(r.allowedTool, "searchActiveRoutes"); },
  },
  {
    name: "fare, no origin -> asks where from, no fare",
    c: controller("fare_question", { destination: "MZUNI" }),
    expect: (r) => { assert.equal(r.text, null); assert.match(r.needsClarification ?? "", /travelling from/i); },
  },
  {
    name: "fare, unknown corridor -> no invented fare",
    c: controller("fare_question", { origin: "Salima", destination: "Mzuzu University" }),
    expect: (r) => { assert.doesNotMatch(r.text ?? "", /MWK/); assert.match(r.text ?? "", /couldn't find an active route/i); },
  },
  {
    name: "schedule with a date, no trip -> honest 'not scheduled', no invented time",
    c: controller("schedule_question", { origin: "Blantyre", destination: "Mzuzu University", travelDate: "2027-06-20" }),
    expect: (r, p) => { assert.match(r.text ?? "", /haven't scheduled a trip for 2027-06-20/i); noInventedFacts(r.text!, p); },
  },
  {
    name: "popular routes -> lists catalogue routes only",
    c: controller("popular_routes"),
    expect: (r, p) => { assert.match(r.text ?? "", /Blantyre - Mzuzu University/); noInventedFacts(r.text!, p); },
  },
  {
    name: "university search -> active list, no invention",
    c: controller("university_search"),
    expect: (r) => { assert.match(r.text ?? "", /MZUNI/); assert.match(r.text ?? "", /KUHeS/); },
  },
  {
    name: "my bookings -> lists the verified rows",
    c: controller("my_bookings"),
    expect: (r, p) => { assert.match(r.text ?? "", /BK-AAA11111/); noInventedFacts(r.text!, p); },
  },
  {
    name: "payment status, known ref, unpaid -> not confirmed, never 'paid'",
    c: controller("payment_status", { bookingId: "BK-AAA11111" }),
    expect: (r) => { assert.match(r.text ?? "", /has not confirmed the booking fee/i); assert.doesNotMatch(r.text ?? "", /confirmed as paid/i); },
  },
  {
    name: "payment status, unknown ref -> polite not-found",
    c: controller("payment_status", { bookingId: "BK-ZZZ99999" }),
    expect: (r) => { assert.ok(r.text === null || /couldn't find/i.test(r.text)); },
  },
  {
    name: "booking deadline -> only the catalogue deadline",
    c: controller("booking_deadline", { bookingId: "BK-AAA11111" }),
    expect: (r, p) => { assert.match(r.text ?? "", /2027-06-15 18:00 Malawi time/); noInventedFacts(r.text!, p); },
  },
  {
    name: "booking details, no ref -> asks for it",
    c: controller("booking_details"),
    expect: (r) => { assert.equal(r.text, null); assert.match(r.needsClarification ?? "", /booking reference/i); },
  },
  {
    name: "pickup question -> catalogue pickup point",
    c: controller("pickup_question", { origin: "Lilongwe", destination: "Blantyre" }),
    expect: (r, p) => { assert.match(r.text ?? "", /Lilongwe Bus Rank/); noInventedFacts(r.text!, p); },
  },
  {
    name: "cancellation info -> safe standard line, no promises",
    c: controller("cancellation_information"),
    expect: (r) => { assert.match(r.text ?? "", /case by case/i); assert.doesNotMatch(r.text ?? "", /refunded|will refund/i); },
  },
  {
    name: "change request -> points to the team, no guarantee",
    c: controller("change_request"),
    expect: (r) => { assert.match(r.text ?? "", /contact our team/i); },
  },
  {
    name: "out-of-scope intent -> null (falls back)",
    c: controller("luggage_question"),
    expect: (r) => { assert.equal(r.text, null); },
  },
  {
    name: "greeting -> null (deterministic path doesn't answer)",
    c: controller("greeting"),
    expect: (r) => { assert.equal(r.text, null); },
  },
];

for (const { name, c, expect } of CASES) {
  test(`quality: ${name}`, async () => {
    const pack = await gatherFacts(c, CTX);
    const r = formatFromPack(c, pack);
    expect(r, renderPack(pack));
  });
}
