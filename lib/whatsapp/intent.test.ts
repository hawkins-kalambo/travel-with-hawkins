import assert from "node:assert/strict";
import test from "node:test";
import { detectIntent, languageFromInput } from "./intent.ts";
import { reduceGlobalCommand } from "./state-machine.ts";

test("recognizes English and Chichewa transactional intents", () => {
  assert.equal(detectIntent("I want to make a booking"), "booking");
  assert.equal(detectIntent("Ndikufuna kupanga booking."), "booking");
  assert.equal(detectIntent("Track my booking"), "tracking");
  assert.equal(detectIntent("I want to speak to someone"), "agent");
});

test("uses stable action ids independent of language", () => {
  assert.equal(detectIntent("Pangani Booking", "menu_booking"), "booking");
  assert.equal(languageFromInput("", "lang_ny"), "ny");
});

test("menu, back, restart, cancel and handoff are deterministic", () => {
  assert.deepEqual(reduceGlobalCommand("booking_email", "back"), { kind: "back", nextStep: "booking_name" });
  assert.deepEqual(reduceGlobalCommand("booking_confirm", "cancel"), { kind: "cancel", nextStep: "menu" });
  assert.deepEqual(reduceGlobalCommand("question", "restart"), { kind: "restart", nextStep: "menu" });
  assert.deepEqual(reduceGlobalCommand("menu", "agent"), { kind: "handoff", nextStep: "agent_waiting" });
});
