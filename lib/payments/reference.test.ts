import test from "node:test";
import assert from "node:assert/strict";
import { generatePaymentReference } from "./reference.ts";

const URL_SAFE_PATTERN = /^[A-Za-z0-9-]+$/;
const PII_MARKERS = [
  "@",
  "student",
  "phone",
  "email",
  "mzuzu",
  "lilongwe",
  "blantyre",
  "zomba",
  "karonga",
  "kasungu",
];

test("booking_fee references use the TWH-BOOKINGFEE- prefix", () => {
  const ref = generatePaymentReference("booking_fee");
  assert.match(ref, /^TWH-BOOKINGFEE-[0-9a-f]{32}$/);
});

test("transport_fare references use the TWH-FARE- prefix", () => {
  const ref = generatePaymentReference("transport_fare");
  assert.match(ref, /^TWH-FARE-[0-9a-f]{32}$/);
});

test("references only use URL-safe characters", () => {
  const ref = generatePaymentReference("booking_fee");
  assert.match(ref, URL_SAFE_PATTERN);
  assert.equal(encodeURIComponent(ref), ref, "reference must not require URL-encoding");
});

test("references contain no obvious PII markers", () => {
  const refs = [generatePaymentReference("booking_fee"), generatePaymentReference("transport_fare")];
  for (const ref of refs) {
    const lower = ref.toLowerCase();
    for (const marker of PII_MARKERS) {
      assert.equal(lower.includes(marker), false, `reference unexpectedly contains "${marker}": ${ref}`);
    }
  }
});

test("references are practically unique across many generations", () => {
  const seen = new Set<string>();
  const count = 5000;
  for (let i = 0; i < count; i += 1) {
    seen.add(generatePaymentReference(i % 2 === 0 ? "booking_fee" : "transport_fare"));
  }
  assert.equal(seen.size, count, "expected no collisions across 5000 generated references");
});

test("different purposes never produce colliding references", () => {
  const bookingFeeRefs = new Set<string>();
  const fareRefs = new Set<string>();
  for (let i = 0; i < 200; i += 1) {
    bookingFeeRefs.add(generatePaymentReference("booking_fee"));
    fareRefs.add(generatePaymentReference("transport_fare"));
  }
  for (const ref of fareRefs) {
    assert.equal(bookingFeeRefs.has(ref), false);
  }
});
