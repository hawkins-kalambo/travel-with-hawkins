import assert from "node:assert/strict";
import test from "node:test";

import { classifySmalltalk } from "./smalltalk.ts";

test("recognises thank-you phrasings", () => {
  for (const s of [
    "thanks", "Thanks!", "thank you", "Thank you.", "thank u", "thankyou",
    "thank you so much", "thank you for your assistance", "thanks for the help",
    "much appreciated", "appreciate it", "ok thank you", "thanks a lot",
    "Thank you very much for your assistance 🙏",
  ]) {
    assert.equal(classifySmalltalk(s), "thanks", s);
  }
});

test("recognises bare greetings", () => {
  for (const s of ["hi", "Hello", "hey", "hiii", "good morning", "Good afternoon", "moni"]) {
    assert.equal(classifySmalltalk(s), "greeting", s);
  }
});

test("recognises sign-offs", () => {
  for (const s of ["bye", "goodbye", "that's all", "nothing else", "I'm good", "we're good, thanks"]) {
    assert.ok(["farewell", "thanks"].includes(classifySmalltalk(s) as string), s);
  }
});

test("does NOT intercept a message that also carries a real question", () => {
  for (const s of [
    "thanks, how much is the fare to Lilongwe?",
    "thank you — when is the next bus?",
    "hi, can I book a seat to Mzuzu",
    "thanks but I still need a receipt",
    "hello what routes do you have",
    "thanks, where is the pickup point",
  ]) {
    assert.equal(classifySmalltalk(s), null, s);
  }
});

test("does not match unrelated statements or empty input", () => {
  for (const s of ["", "   ", "the driver was rude", "my booking is BK-12345678", "I want to travel tomorrow"]) {
    assert.equal(classifySmalltalk(s), null, JSON.stringify(s));
  }
});

test("ignores an over-long message even if it starts politely", () => {
  const long = "thank you very much for all of your help today, however I have a long story to tell about my trip";
  assert.equal(classifySmalltalk(long), null);
});
