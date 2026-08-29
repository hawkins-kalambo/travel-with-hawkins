import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { buildWhatsAppLink, whatsAppBotNumber, whatsAppBotNumberDisplay } from "./whatsappLink.ts";

afterEach(() => { delete process.env.NEXT_PUBLIC_WHATSAPP_BOT_NUMBER; });

test("falls back to the official bot number when unset", () => {
  assert.equal(whatsAppBotNumber(), "265890845383");
  assert.equal(whatsAppBotNumberDisplay(), "+265 890 84 53 83");
});

test("honours NEXT_PUBLIC_WHATSAPP_BOT_NUMBER and strips non-digits", () => {
  process.env.NEXT_PUBLIC_WHATSAPP_BOT_NUMBER = "+265 999 11 22 33";
  assert.equal(whatsAppBotNumber(), "265999112233");
  assert.equal(whatsAppBotNumberDisplay(), "+265 999 11 22 33");
});

test("buildWhatsAppLink produces a wa.me URL with an encoded prefill", () => {
  assert.equal(
    buildWhatsAppLink("Hi Travel With Hawkins"),
    "https://wa.me/265890845383?text=Hi%20Travel%20With%20Hawkins",
  );
});

test("buildWhatsAppLink with an empty prefill omits ?text", () => {
  assert.equal(buildWhatsAppLink(""), "https://wa.me/265890845383");
});

test("buildWhatsAppLink never carries anything but the number and a greeting", () => {
  const url = buildWhatsAppLink();
  assert.ok(url.startsWith("https://wa.me/265890845383"));
  assert.doesNotMatch(url, /token|secret|phone_number_id|waba/i);
});

test("a very long prefill is truncated", () => {
  const url = buildWhatsAppLink("x".repeat(500));
  const text = new URL(url).searchParams.get("text") || "";
  assert.equal(text.length, 300);
});
