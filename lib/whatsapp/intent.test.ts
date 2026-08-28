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

test("standalone greetings and menu/restart words normalise to a menu return", () => {
  for (const greeting of ["hello", "Hi", "  HELLO ", "hey", "moni", "menu", "0"]) {
    assert.equal(detectIntent(greeting), "menu", greeting);
  }
  for (const word of ["restart", "reset", "start over"]) {
    assert.equal(detectIntent(word), "restart", word);
  }
  // A greeting that is part of a real request is NOT swallowed as "menu".
  assert.equal(detectIntent("hello I want to book a trip"), "booking");
  assert.equal(detectIntent("hi how much is Lilongwe to Mzuzu"), "routes");
});

test("uses stable action ids independent of language", () => {
  assert.equal(detectIntent("Pangani Booking", "menu_booking"), "booking");
  assert.equal(languageFromInput("", "lang_ny"), "ny");
});

test("menu, back, restart, cancel and handoff are deterministic", () => {
  assert.deepEqual(reduceGlobalCommand("booking_email", "back"), { kind: "back", nextStep: "booking_name" });
  assert.deepEqual(reduceGlobalCommand("booking_review", "cancel"), { kind: "cancel", nextStep: "menu" });
  assert.deepEqual(reduceGlobalCommand("booking_review", "back"), { kind: "back", nextStep: "booking_student_id" });
  assert.deepEqual(reduceGlobalCommand("question", "restart"), { kind: "restart", nextStep: "menu" });
  assert.deepEqual(reduceGlobalCommand("menu", "agent"), { kind: "handoff", nextStep: "agent_waiting" });
});
