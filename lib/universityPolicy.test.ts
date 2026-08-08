import assert from "node:assert/strict";
import test from "node:test";

import { isUniversityAvailableForPurpose } from "./universityPolicy.ts";

test("customer booking only accepts active universities", () => {
  assert.equal(isUniversityAvailableForPurpose("active", "booking"), true);
  assert.equal(isUniversityAvailableForPurpose("inactive", "booking"), false);
});

test("ambassador recruitment accepts configured pre-launch universities", () => {
  assert.equal(isUniversityAvailableForPurpose("active", "recruitment"), true);
  assert.equal(isUniversityAvailableForPurpose("inactive", "recruitment"), true);
  assert.equal(isUniversityAvailableForPurpose("unknown", "recruitment"), false);
});
