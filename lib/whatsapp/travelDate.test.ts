import assert from "node:assert/strict";
import test from "node:test";

import { resolveTravelDate } from "./travelDate.ts";

// Malawi is UTC+2, so 10:00 UTC on 30 Aug 2026 is noon, 30 Aug 2026 in Blantyre.
const NOW = new Date("2026-08-30T10:00:00Z");

function iso(input: string): string {
  const r = resolveTravelDate(input, NOW);
  assert.equal(r.ok, true, `expected "${input}" to resolve`);
  return r.ok ? r.iso : "";
}

test("accepts an explicit future YYYY-MM-DD and echoes an unambiguous label", () => {
  const r = resolveTravelDate("2026-09-20", NOW);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.iso, "2026-09-20");
  assert.match(r.ok ? r.label : "", /20 September 2026/);
});

test("resolves 'tomorrow' against the Malawi calendar day", () => {
  assert.equal(iso("tomorrow"), "2026-08-31");
});

test("resolves 'in 3 days'", () => {
  assert.equal(iso("in 3 days"), "2026-09-02");
});

test("day-first numeric date (Malawi convention)", () => {
  assert.equal(iso("20/09/2026"), "2026-09-20");
  assert.equal(iso("5-9-2026"), "2026-09-05");
});

test("spelled-out date, with and without a year", () => {
  assert.equal(iso("20 September"), "2026-09-20");
  assert.equal(iso("September 20 2026"), "2026-09-20");
  assert.equal(iso("5 Jan 2027"), "2027-01-05");
});

test("a bare month/day already past this year rolls to next year", () => {
  // 15 March is before 30 Aug 2026 -> resolves to 2027-03-15
  assert.equal(iso("15 March"), "2027-03-15");
});

test("rejects a past date", () => {
  assert.deepEqual(resolveTravelDate("2026-08-01", NOW), { ok: false, reason: "past" });
  assert.deepEqual(resolveTravelDate("2025-12-31", NOW), { ok: false, reason: "past" });
});

test("today is allowed (not treated as past)", () => {
  assert.equal(iso("today"), "2026-08-30");
});

test("rejects a date more than a year away", () => {
  assert.deepEqual(resolveTravelDate("2028-01-01", NOW), { ok: false, reason: "too_far" });
});

test("rejects unparseable input, never guesses", () => {
  assert.deepEqual(resolveTravelDate("next friday", NOW), { ok: false, reason: "unparseable" });
  assert.deepEqual(resolveTravelDate("sometime soon", NOW), { ok: false, reason: "unparseable" });
  assert.deepEqual(resolveTravelDate("", NOW), { ok: false, reason: "unparseable" });
  assert.deepEqual(resolveTravelDate("32/01/2026", NOW), { ok: false, reason: "unparseable" });
});
