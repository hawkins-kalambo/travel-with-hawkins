import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

// Regression cover for the "stuck conversation" incident:
//   English -> Find a Route -> "Lilongwe" -> silence, and every later message
//   from that contact also silent.
// Root cause: findAvailableDepartures() threw, the route_origin handler had no
// guard, and Phase 2 swallowed the throw (marked processed, sent nothing),
// leaving the conversation pinned to route_origin where every subsequent
// message re-entered the same throwing branch.

type OutMsg = { type: string; text?: string; body?: string };

const state = {
  delivered: [] as OutMsg[],
  transitions: [] as { step: string; data: unknown }[],
  finished: 0,
  failed: [] as string[],
  departuresCalls: 0,
  loadDepartureCalls: 0,
  bookingCalls: 0,
  paymentCalls: 0,
  listCalls: 0,
  cancelCalls: 0,
};

// Per-test knobs
let claimResult: unknown;
let conversationRow: Record<string, unknown>;
let departuresImpl: (origin?: string) => Promise<unknown[]>;
let loadDepartureImpl: (id: string) => Promise<unknown>;
let createBookingImpl: (...a: unknown[]) => Promise<unknown>;
let paymentImpl: () => unknown;
let listImpl: () => unknown[];
let loadBookingImpl: (id: string) => unknown;
let cancelImpl: (...a: unknown[]) => unknown;
let transitionThrows: string | null;

function baseConversation(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: "conv-1", contactId: "contact-1", waId: "+265991234567",
    language: "en", mode: "bot", status: "bot_controlled", step: "menu",
    data: {}, version: 1, serviceWindowExpiresAt: null, stateExpiresAt: null,
    optedOut: false, ...overrides,
  };
}

mock.module("@/lib/logger", { exports: { logInfo() {}, logWarn() {}, logError() {} } });
mock.module("@/lib/rateLimit", { exports: { isRateLimited: async () => false } });
mock.module("@/lib/whatsapp/client", { exports: { markWhatsAppMessageRead: async () => {} } });
mock.module("@/lib/whatsapp/ai-provider", { exports: { getWhatsAppAiProvider: () => null } });
mock.module("@/lib/whatsapp/domain", {
  exports: {
    findAvailableDepartures: async (origin?: string) => { state.departuresCalls += 1; return departuresImpl(origin); },
    loadDeparture: async (id: string) => { state.loadDepartureCalls += 1; return loadDepartureImpl(id); },
    createWhatsAppBooking: async (...a: unknown[]) => { state.bookingCalls += 1; return createBookingImpl(...a); },
    getBookingFeeAmount: async () => 5000,
    getOrCreateBookingFeeCheckout: async () => { state.paymentCalls += 1; return paymentImpl(); },
    listWhatsAppBookings: async () => { state.listCalls += 1; return listImpl(); },
    loadWhatsAppBooking: async (id: string) => loadBookingImpl(id),
    cancelWhatsAppBooking: async (...a: unknown[]) => { state.cancelCalls += 1; return cancelImpl(...a); },
    trackBookingForWhatsApp: async () => null,
  },
});
mock.module("@/lib/whatsapp/repository", {
  exports: {
    claimWebhookEvent: async () => claimResult,
    finishWebhookEvent: async () => { state.finished += 1; },
    failWebhookEvent: async (_id: string, code: string) => { state.failed.push(code); },
    updateDeliveryStatus: async () => {},
    ensureConversation: async () => ({ ...conversationRow }),
    recordInbound: async () => {},
    deliverAndRecord: async (_c: unknown, message: OutMsg) => { state.delivered.push(message); return "wamid.out"; },
    transitionState: async (conversation: Record<string, unknown>, step: string, data: unknown) => {
      if (transitionThrows) throw new Error(transitionThrows);
      state.transitions.push({ step, data });
      return { ...conversation, step, data, version: Number(conversation.version) + 1 };
    },
    setLanguage: async (conversation: Record<string, unknown>, language: string) => ({ ...conversation, language }),
    setOptOut: async () => {},
    requestHuman: async (conversation: Record<string, unknown>) => ({ ...conversation, mode: "human", status: "waiting", step: "agent_waiting" }),
  },
});

const { processWhatsAppEvent } = await import("./processor.ts");

function inbound(text: string, overrides: Record<string, unknown> = {}) {
  claimResult = {
    eventId: "evt", correlationId: "corr",
    event: { kind: "message", id: `wamid.${Math.random().toString(36).slice(2)}`, from: "+265991234567", inputType: "text", text, ...overrides },
  };
}
function texts() { return state.delivered.map((m) => m.text ?? m.body ?? `[${m.type}]`); }
function steps() { return state.transitions.map((t) => t.step); }

beforeEach(() => {
  state.delivered = []; state.transitions = []; state.finished = 0; state.failed = [];
  state.departuresCalls = 0; state.loadDepartureCalls = 0; state.bookingCalls = 0; state.paymentCalls = 0;
  state.listCalls = 0; state.cancelCalls = 0;
  claimResult = null;
  conversationRow = baseConversation();
  departuresImpl = async () => [];
  loadDepartureImpl = async () => null;
  createBookingImpl = async () => ({ outcome: "rejected", reason: "test" });
  paymentImpl = () => ({ outcome: "rejected", reason: "test" });
  listImpl = () => [];
  loadBookingImpl = () => null;
  cancelImpl = () => ({ outcome: "not_found" });
  transitionThrows = null;
});

const oneDeparture = [{
  id: "dep-1", routeId: "route-1", routeLabel: "Lilongwe - Mzuzu University",
  travelDate: "2026-09-01", departureTime: "07:00:00", fare: 12000, pickup: "Lilongwe Main", availableSeats: 30,
}];

// ---------------------------------------------------------------------------
// 1. English -> Find a Route -> Lilongwe (happy path)
// ---------------------------------------------------------------------------
test("route_origin with a matching district advances to destination and lists departures", async () => {
  conversationRow = baseConversation({ step: "route_origin" });
  departuresImpl = async () => oneDeparture;
  inbound("Lilongwe");
  await processWhatsAppEvent("evt");
  assert.equal(state.departuresCalls, 1);
  assert.deepEqual(steps(), ["route_destination"]);
  assert.equal(state.delivered.at(-1)?.type, "list");
  assert.equal(state.finished, 1);
  assert.deepEqual(state.failed, []);
});

// ---------------------------------------------------------------------------
// 2. No matching routes  +  route-query failure
// ---------------------------------------------------------------------------
test("route_origin with no matching routes replies (not silence) and stays put", async () => {
  conversationRow = baseConversation({ step: "route_origin" });
  departuresImpl = async () => [];
  inbound("Nowhereville");
  await processWhatsAppEvent("evt");
  assert.equal(texts().length, 1);
  assert.match(texts()[0], /no published travel dates/i);
  assert.deepEqual(steps(), [], "no state change on an empty result");
  assert.equal(state.finished, 1);
  assert.deepEqual(state.failed, []);
});

test("route_origin lookup FAILURE returns the customer to the menu, not silence (the Lilongwe bug)", async () => {
  conversationRow = baseConversation({ step: "route_origin" });
  departuresImpl = async () => { throw new Error("PGRST200 relationship not found"); };
  inbound("Lilongwe");
  await processWhatsAppEvent("evt");
  // A reply WAS sent, and the conversation was moved back to the menu.
  assert.ok(texts().length >= 1, "customer received a reply");
  assert.match(texts().join("\n"), /can't look up routes|main menu/i);
  assert.deepEqual(steps(), ["menu"]);
  assert.equal(state.finished, 1);
  assert.deepEqual(state.failed, [], "a handled lookup error is not a webhook failure");
});

test("after a lookup failure, the NEXT message is handled normally (no permanent silence)", async () => {
  conversationRow = baseConversation({ step: "route_origin" });
  departuresImpl = async () => { throw new Error("db down"); };
  inbound("Lilongwe");
  await processWhatsAppEvent("evt");
  // conversation is now at menu (from the fix); simulate that for the 2nd message
  conversationRow = baseConversation({ step: "menu" });
  state.delivered = []; state.transitions = [];
  inbound("Pay Booking Fee");
  await processWhatsAppEvent("evt");
  assert.deepEqual(steps(), ["payment_booking_id"]);
  assert.match(texts().join("\n"), /booking ID/i);
});

// ---------------------------------------------------------------------------
// 3. Hello / Menu / Restart from bot-managed states
// ---------------------------------------------------------------------------
for (const step of ["route_origin", "route_destination", "booking_name", "booking_seats", "payment_booking_id", "tracking_booking_id", "question"]) {
  for (const word of ["hello", "Hi", "  MENU ", "restart"]) {
    test(`"${word.trim()}" from ${step} returns to the menu without touching route lookup`, async () => {
      conversationRow = baseConversation({ step, data: { origin: "x", booking: { name: "Jo" } } });
      inbound(word);
      await processWhatsAppEvent("evt");
      assert.deepEqual(steps(), ["menu"], "transitioned to menu");
      assert.equal(state.departuresCalls, 0);
      assert.equal(state.loadDepartureCalls, 0);
      assert.equal(state.bookingCalls, 0);
      assert.equal(state.paymentCalls, 0);
      assert.match(texts().join("\n"), /how can we help/i);
      assert.equal(state.finished, 1);
    });
  }
}

// ---------------------------------------------------------------------------
// 4. Completed / expired sessions are reusable
// ---------------------------------------------------------------------------
test("a completed flow leaves the conversation at the menu, ready for the next task", async () => {
  conversationRow = baseConversation({ step: "menu" });
  inbound("Track My Booking");
  await processWhatsAppEvent("evt");
  assert.deepEqual(steps(), ["tracking_booking_id"]);
});

test("an expired mid-flow session resets to the menu and re-reads the message there", async () => {
  conversationRow = baseConversation({
    step: "route_origin",
    stateExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    data: { origin: "stale" },
  });
  inbound("Pay Booking Fee");
  await processWhatsAppEvent("evt");
  // reset to menu, THEN the payment intent starts a payment flow
  assert.deepEqual(steps(), ["menu", "payment_booking_id"]);
  assert.equal(state.departuresCalls, 0, "the message was not consumed as a district");
});

test("a non-expired mid-flow session is NOT reset", async () => {
  conversationRow = baseConversation({
    step: "route_origin",
    stateExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  departuresImpl = async () => [];
  inbound("Lilongwe");
  await processWhatsAppEvent("evt");
  assert.equal(state.departuresCalls, 1, "still treated as a district");
  assert.deepEqual(steps(), []);
});

// ---------------------------------------------------------------------------
// 5. Duplicate deliveries and restart/concurrent-message races
// ---------------------------------------------------------------------------
test("a duplicate delivery (claim returns nothing) does no work", async () => {
  claimResult = null;
  await processWhatsAppEvent("evt");
  assert.equal(state.departuresCalls, 0);
  assert.equal(state.delivered.length, 0);
  assert.equal(state.finished, 0);
});

test("a stale in-flight message that loses the version race is dropped quietly (no systemError spam)", async () => {
  conversationRow = baseConversation({ step: "route_origin" });
  departuresImpl = async () => oneDeparture;
  transitionThrows = "conversation_state_conflict";
  inbound("Lilongwe");
  await processWhatsAppEvent("evt");
  assert.equal(state.finished, 1, "event is closed");
  assert.deepEqual(state.failed, [], "not re-queued");
  assert.deepEqual(texts(), [], "no confusing systemError reply after a state conflict");
});

test("an unexpected handling error still sends a recovery reply the customer can act on", async () => {
  conversationRow = baseConversation({ step: "route_origin" });
  departuresImpl = async () => oneDeparture; // lookup ok...
  transitionThrows = "boom"; // ...but the transition blows up in an unexpected way
  inbound("Lilongwe");
  await processWhatsAppEvent("evt");
  assert.equal(state.finished, 1);
  assert.deepEqual(state.failed, []);
  assert.match(texts().join("\n"), /menu|agent/i);
});

// ---------------------------------------------------------------------------
// 6. Preservation of bookings, payments and human handoff
// ---------------------------------------------------------------------------
test("restarting from booking_confirm does NOT create, cancel or retry a booking/payment", async () => {
  conversationRow = baseConversation({
    step: "booking_confirm",
    data: { booking: { departureId: "dep-1", name: "Jo", seats: 2 } },
  });
  inbound("menu");
  await processWhatsAppEvent("evt");
  assert.equal(state.bookingCalls, 0);
  assert.equal(state.paymentCalls, 0);
  assert.deepEqual(steps(), ["menu"]);
  assert.deepEqual(state.transitions[0]?.data, {}, "only transient flow data is cleared");
});

test("agent-managed conversations are never taken over by the bot", async () => {
  conversationRow = baseConversation({ step: "route_origin", mode: "human" });
  inbound("hello");
  await processWhatsAppEvent("evt");
  assert.deepEqual(texts(), [], "no bot reply while an agent owns the chat");
  assert.deepEqual(steps(), []);
  assert.equal(state.departuresCalls, 0);
  assert.equal(state.finished, 1, "event still acknowledged");
});

// ===========================================================================
// P2 pilot booking rules
// ===========================================================================

const draft = {
  departureId: "dep-1", routeId: "route-1", routeLabel: "Lilongwe - Mzuzu University",
  travelDate: "2026-09-01", departureTime: "07:00:00", pickup: "Lilongwe Main",
  fare: 12000, passengerIsSelf: true, name: "Jane Banda",
};

test("booking flow: choosing a departure asks self/other, never a seat count", async () => {
  conversationRow = baseConversation({ step: "booking_departure", data: { booking: {} } });
  loadDepartureImpl = async () => oneDeparture[0];
  inbound("pick", { actionId: "departure:dep-1" });
  await processWhatsAppEvent("evt");
  assert.deepEqual(steps(), ["booking_passenger_for"]);
  assert.equal(state.delivered.at(-1)?.type, "buttons");
  assert.match(texts().join("\n"), /for you, or for someone else/i);
});

test("booking flow: the passenger name is always asked, even for self", async () => {
  conversationRow = baseConversation({ step: "booking_passenger_for", data: { booking: { ...draft, name: undefined } } });
  inbound("me", { actionId: "booking_self" });
  await processWhatsAppEvent("evt");
  assert.deepEqual(steps(), ["booking_name"]);
  assert.match(texts().join("\n"), /full name/i);
});

test("booking flow: the review shows fare, booking fee and total before confirming", async () => {
  conversationRow = baseConversation({ step: "booking_student_id", data: { booking: draft } });
  inbound("skip");
  await processWhatsAppEvent("evt");
  assert.deepEqual(steps(), ["booking_review"]);
  const body = texts().join("\n");
  assert.match(body, /Fare: MWK 12,000/);
  assert.match(body, /Booking fee \(pay now\): MWK 5,000/);
  assert.match(body, /Total: MWK 17,000/);
});

test("booking review + confirm: standard-deadline booking returns ID, deadline and pay link", async () => {
  conversationRow = baseConversation({ step: "booking_review", data: { booking: draft } });
  createBookingImpl = async () => ({
    outcome: "created", bookingId: "BK-9", expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    fare: 12000, bookingFee: 5000, shortNotice: false,
  });
  paymentImpl = () => ({ outcome: "checkout", url: "https://pay.example/abc", amount: 5000 });
  inbound("confirm", { actionId: "flow_confirm" });
  await processWhatsAppEvent("evt");
  assert.equal(state.bookingCalls, 1);
  const body = texts().join("\n");
  assert.match(body, /BK-9/);
  assert.match(body, /Malawi time/);
  assert.match(body, /https:\/\/pay\.example\/abc/);
  assert.equal(steps().at(-1), "menu");
  assert.equal(state.finished, 1);
});

test("booking review + confirm: a short-notice booking says 15 minutes", async () => {
  conversationRow = baseConversation({ step: "booking_review", data: { booking: draft } });
  createBookingImpl = async () => ({
    outcome: "created", bookingId: "BK-10", expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    fare: 12000, bookingFee: 5000, shortNotice: true,
  });
  paymentImpl = () => ({ outcome: "checkout", url: "https://pay.example/x", amount: 5000 });
  inbound("yes");
  await processWhatsAppEvent("evt");
  assert.match(texts().join("\n"), /15 minutes/);
});

test("booking review + confirm: unpaid-limit rejection is explained, no loop, back to menu", async () => {
  conversationRow = baseConversation({ step: "booking_review", data: { booking: draft } });
  createBookingImpl = async () => ({ outcome: "rejected", reason: "unpaid_limit_reached" });
  inbound("confirm");
  await processWhatsAppEvent("evt");
  assert.match(texts().join("\n"), /3 unpaid reservations/i);
  assert.equal(steps().at(-1), "menu");
  assert.equal(state.paymentCalls, 0, "no payment attempted on a rejected booking");
  assert.equal(state.finished, 1);
});

test("booking review + confirm: departure-too-soon rejection points to an agent", async () => {
  conversationRow = baseConversation({ step: "booking_review", data: { booking: draft } });
  createBookingImpl = async () => ({ outcome: "rejected", reason: "departure_too_soon" });
  inbound("confirm");
  await processWhatsAppEvent("evt");
  assert.match(texts().join("\n"), /within 24 hours/i);
});

test("booking review: declining creates no booking and takes no payment", async () => {
  conversationRow = baseConversation({ step: "booking_review", data: { booking: draft } });
  inbound("no");
  await processWhatsAppEvent("evt");
  assert.equal(state.bookingCalls, 0);
  assert.equal(state.paymentCalls, 0);
  assert.deepEqual(steps(), ["menu"]);
});

test("My Bookings: an empty list replies helpfully and stays at the menu", async () => {
  conversationRow = baseConversation({ step: "menu" });
  listImpl = () => [];
  inbound("my bookings");
  await processWhatsAppEvent("evt");
  assert.match(texts().join("\n"), /no bookings linked/i);
  assert.deepEqual(steps(), []);
});

test("My Bookings: lists bookings, then an explicit selection opens that booking's actions", async () => {
  conversationRow = baseConversation({ step: "menu" });
  listImpl = () => [
    { bookingId: "BK-1", routeLabel: "Lilongwe - MZUNI", travelDate: "2026-09-01", status: "Booked", bookingFeeStatus: "unpaid", fareStatus: "unpaid", expiresAt: new Date(Date.now() + 6 * 86_400_000).toISOString() },
    { bookingId: "BK-2", routeLabel: "Zomba - MZUNI", travelDate: "2026-09-05", status: "Booked", bookingFeeStatus: "paid", fareStatus: "unpaid", expiresAt: null },
  ];
  inbound("my bookings");
  await processWhatsAppEvent("evt");
  assert.deepEqual(steps(), ["my_bookings"]);
  assert.equal(state.delivered.at(-1)?.type, "list");

  state.delivered = []; state.transitions = [];
  conversationRow = baseConversation({ step: "my_bookings" });
  loadBookingImpl = (id) => id === "BK-1"
    ? { bookingId: "BK-1", routeLabel: "Lilongwe - MZUNI", travelDate: "2026-09-01", status: "Booked", bookingFeeStatus: "unpaid", fareStatus: "unpaid", expiresAt: new Date(Date.now() + 6 * 86_400_000).toISOString() }
    : null;
  inbound("open", { actionId: "bk:BK-1" });
  await processWhatsAppEvent("evt");
  assert.deepEqual(steps(), ["booking_action"]);
  assert.deepEqual(state.transitions[0].data, { selectedBookingId: "BK-1" });
  assert.match(texts().join("\n"), /BK-1/);
});

test("Booking actions: Pay fee uses the fee checkout for the selected booking", async () => {
  conversationRow = baseConversation({ step: "booking_action", data: { selectedBookingId: "BK-1" } });
  paymentImpl = () => ({ outcome: "checkout", url: "https://pay.example/BK-1", amount: 5000 });
  inbound("pay", { actionId: "bk_pay" });
  await processWhatsAppEvent("evt");
  assert.equal(state.paymentCalls, 1);
  assert.match(texts().join("\n"), /pay\.example\/BK-1/);
  assert.equal(steps().at(-1), "menu");
});

test("Booking actions: Cancel then confirm cancels the reservation", async () => {
  conversationRow = baseConversation({ step: "booking_action", data: { selectedBookingId: "BK-1" } });
  inbound("Cancel booking", { actionId: "bk_cancel" }); // real button title; bare "cancel" is a global command
  await processWhatsAppEvent("evt");
  assert.deepEqual(steps(), ["cancel_confirm"]);

  state.delivered = []; state.transitions = [];
  conversationRow = baseConversation({ step: "cancel_confirm", data: { selectedBookingId: "BK-1" } });
  cancelImpl = () => ({ outcome: "cancelled" });
  inbound("confirm", { actionId: "flow_confirm" });
  await processWhatsAppEvent("evt");
  assert.equal(state.cancelCalls, 1);
  assert.match(texts().join("\n"), /cancelled/i);
  assert.equal(steps().at(-1), "menu");
});

test("Booking actions: a booking the bot can't cancel is handed to an agent", async () => {
  conversationRow = baseConversation({ step: "cancel_confirm", data: { selectedBookingId: "BK-1" } });
  cancelImpl = () => ({ outcome: "needs_agent" });
  inbound("confirm");
  await processWhatsAppEvent("evt");
  assert.match(texts().join("\n"), /agent/i);
  assert.deepEqual(steps(), [], "handoff via requestHuman, not a state transition");
});

test("cancel_confirm: declining keeps the booking (no cancel call)", async () => {
  conversationRow = baseConversation({ step: "cancel_confirm", data: { selectedBookingId: "BK-1" } });
  inbound("no");
  await processWhatsAppEvent("evt");
  assert.equal(state.cancelCalls, 0);
  assert.deepEqual(steps(), ["menu"]);
});

for (const step of ["booking_review", "my_bookings", "booking_action", "cancel_confirm"]) {
  test(`"menu" from ${step} returns to the menu with no booking/payment/cancel side effects`, async () => {
    conversationRow = baseConversation({ step, data: { booking: draft, selectedBookingId: "BK-1" } });
    inbound("menu");
    await processWhatsAppEvent("evt");
    assert.deepEqual(steps(), ["menu"]);
    assert.equal(state.bookingCalls, 0);
    assert.equal(state.paymentCalls, 0);
    assert.equal(state.cancelCalls, 0);
  });
}
