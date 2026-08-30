import assert from "node:assert/strict";
import test from "node:test";

import { classifyUrgency } from "./urgency.ts";

test("clear emergencies classify as urgent", () => {
  for (const m of [
    "the bus left without me",
    "I missed my bus and I'm stranded",
    "I cannot find the pickup point",
    "there has been an accident on the road",
    "the driver is driving dangerously",
    "the driver is drunk",
    "I feel unsafe on this bus",
    "my payment was deducted twice",
    "someone is asking me to pay to a personal number",
    "this is an emergency, I need urgent help",
  ]) {
    assert.equal(classifyUrgency(m), "urgent", m);
  }
});

test("ordinary questions are normal", () => {
  for (const m of [
    "how much is Lilongwe to Mzuzu",
    "what time does the bus leave tomorrow",
    "can I bring two bags",
    "is the booking fee separate from the fare",
    "where do I pay",
  ]) {
    assert.equal(classifyUrgency(m), "normal", m);
  }
});

test("elevated-but-not-emergency messages are high", () => {
  assert.equal(classifyUrgency("I think I boarded the wrong bus"), "high");
  assert.equal(classifyUrgency("I left my bag on the vehicle"), "high");
});

test("empty / non-string input is normal, never throws", () => {
  assert.equal(classifyUrgency(""), "normal");
  assert.equal(classifyUrgency(undefined as unknown as string), "normal");
});
