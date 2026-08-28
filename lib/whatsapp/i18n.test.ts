import assert from "node:assert/strict";
import test from "node:test";
import { chichewa, english, hasCompleteTranslations, t } from "./i18n.ts";

test("English and Chichewa contain every required key", () => {
  assert.equal(hasCompleteTranslations(), true);
  assert.deepEqual(Object.keys(chichewa).sort(), Object.keys(english).sort());
});

test("translation interpolation is deterministic", () => {
  assert.match(t("ny", "bookingCreated", { bookingId: "BK-1" }), /BK-1/);
});
