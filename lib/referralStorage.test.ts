import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeReferralCode,
  parseStoredReferral,
  serializeStoredReferral,
  resolveInitialReferral,
  REFERRAL_TTL_MS,
} from "./referralStorage.ts";

test("sanitizeReferralCode uppercases and trims valid codes", () => {
  assert.equal(sanitizeReferralCode("  th-mzu-00001 "), "TH-MZU-00001");
});

test("sanitizeReferralCode rejects codes with disallowed characters", () => {
  assert.equal(sanitizeReferralCode("bad code!"), undefined);
  assert.equal(sanitizeReferralCode(""), undefined);
  assert.equal(sanitizeReferralCode(null), undefined);
  assert.equal(sanitizeReferralCode(undefined), undefined);
});

test("parseStoredReferral accepts a fresh, well-formed value", () => {
  const now = Date.now();
  const raw = serializeStoredReferral("TEDZULU01", now - 1000);
  const result = parseStoredReferral(raw, now);
  assert.deepEqual(result, { code: "TEDZULU01", capturedAt: now - 1000 });
});

test("parseStoredReferral rejects an expired value", () => {
  const now = Date.now();
  const raw = serializeStoredReferral("TEDZULU01", now - REFERRAL_TTL_MS - 1);
  assert.equal(parseStoredReferral(raw, now), null);
});

test("parseStoredReferral rejects malformed JSON", () => {
  assert.equal(parseStoredReferral("not json", Date.now()), null);
});

test("parseStoredReferral rejects a value with an invalid code", () => {
  const raw = JSON.stringify({ code: "bad code!", capturedAt: Date.now() });
  assert.equal(parseStoredReferral(raw, Date.now()), null);
});

test("parseStoredReferral rejects a capturedAt in the future (clock tampering / corrupt data)", () => {
  const now = Date.now();
  const raw = serializeStoredReferral("TEDZULU01", now + 60_000);
  assert.equal(parseStoredReferral(raw, now), null);
});

test("resolveInitialReferral: a fresh URL code always wins over stored state (last-click)", () => {
  const now = Date.now();
  const stored = serializeStoredReferral("OLDCODE", now - 1000);
  const result = resolveInitialReferral({ urlCode: "newcode", storedRaw: stored, now });
  assert.equal(result?.code, "NEWCODE");
  assert.equal(result?.source, "link");
  assert.ok(result?.nextStoredValue, "should persist the new code back to storage");
});

test("resolveInitialReferral: falls back to a non-expired stored code when no URL code is present", () => {
  const now = Date.now();
  const stored = serializeStoredReferral("STOREDCODE", now - 1000);
  const result = resolveInitialReferral({ urlCode: undefined, storedRaw: stored, now });
  assert.equal(result?.code, "STOREDCODE");
  assert.equal(result?.source, "link");
  assert.equal(result?.nextStoredValue, undefined, "should not rewrite storage when reusing an existing value");
});

test("resolveInitialReferral: returns null when there is neither a URL code nor valid stored state", () => {
  assert.equal(resolveInitialReferral({ urlCode: undefined, storedRaw: null }), null);
});
