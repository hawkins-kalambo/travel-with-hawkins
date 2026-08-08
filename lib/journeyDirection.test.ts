import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJourneyName,
  getJourneyEndpoints,
  getJourneyPickupLabel,
  isJourneyDirection,
  journeyDirectionLabel,
} from "./journeyDirection.ts";

test("recognizes only supported one-way journey directions", () => {
  assert.equal(isJourneyDirection("to_university"), true);
  assert.equal(isJourneyDirection("from_university"), true);
  assert.equal(isJourneyDirection("round_trip"), false);
});

test("builds a home to university journey", () => {
  assert.equal(buildJourneyName("Lilongwe", "Mzuzu University", "to_university"), "Lilongwe - Mzuzu University");
  assert.deepEqual(getJourneyEndpoints("Lilongwe", "Mzuzu University", "to_university"), {
    origin: "Lilongwe",
    destination: "Mzuzu University",
  });
  assert.equal(journeyDirectionLabel("to_university"), "Going to university");
});

test("reverses endpoints when the student is going home", () => {
  assert.equal(buildJourneyName("Lilongwe", "Mzuzu University", "from_university"), "Mzuzu University - Lilongwe");
  assert.deepEqual(getJourneyEndpoints("Lilongwe", "Mzuzu University", "from_university"), {
    origin: "Mzuzu University",
    destination: "Lilongwe",
  });
  assert.equal(journeyDirectionLabel("from_university"), "Going home");
});

test("uses the district point as pickup when going to university", () => {
  assert.equal(getJourneyPickupLabel("to_university", "Game Complex", "Main Campus", "Lilongwe", "MZUNI"), "Game Complex");
});

test("uses the campus point as pickup when going home", () => {
  assert.equal(getJourneyPickupLabel("from_university", "Game Complex", "Main Campus", "Lilongwe", "MZUNI"), "Main Campus");
});
