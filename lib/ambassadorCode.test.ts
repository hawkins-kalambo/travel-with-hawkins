import test from "node:test";
import assert from "node:assert/strict";
import { universityCode, formatReferralCode } from "./ambassadorCodeFormat.ts";

test("universityCode derives a 3-letter code from the university name", () => {
  assert.equal(universityCode("Mzuzu University"), "MZU");
  assert.equal(universityCode("Malawi University of Science and Technology"), "MAL");
});

test("universityCode strips non-letters and pads short/empty input", () => {
  assert.equal(universityCode("M2"), "MXX");
  assert.equal(universityCode(""), "MZU");
  assert.equal(universityCode(null), "MZU");
  assert.equal(universityCode(undefined), "MZU");
});

test("formatReferralCode zero-pads the sequence to 5 digits", () => {
  assert.equal(formatReferralCode("MZU", 1), "TH-MZU-00001");
  assert.equal(formatReferralCode("MZU", 42), "TH-MZU-00042");
  assert.equal(formatReferralCode("MZU", 100000), "TH-MZU-100000");
});
