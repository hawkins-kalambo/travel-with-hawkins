import assert from "node:assert/strict";
import test from "node:test";

import { looksLikeUniversity, matchDistrict, parseTypedRoute } from "./routeParsing.ts";

test("parses 'X to Y'", () => {
  assert.deepEqual(parseTypedRoute("Lilongwe to Mzuzu"), { kind: "pair", origin: "Lilongwe", destination: "Mzuzu" });
  assert.deepEqual(parseTypedRoute("Blantyre to Mzuzu"), { kind: "pair", origin: "Blantyre", destination: "Mzuzu" });
});

test("strips a leading 'From'", () => {
  assert.deepEqual(parseTypedRoute("From Zomba to Lilongwe"), { kind: "pair", origin: "Zomba", destination: "Lilongwe" });
});

test("accepts dash and arrow separators", () => {
  assert.deepEqual(parseTypedRoute("Kasungu - Mzuzu"), { kind: "pair", origin: "Kasungu", destination: "Mzuzu" });
  assert.deepEqual(parseTypedRoute("Karonga → Mzuzu"), { kind: "pair", origin: "Karonga", destination: "Mzuzu" });
  assert.deepEqual(parseTypedRoute("Lilongwe -> Mzuzu University"), { kind: "pair", origin: "Lilongwe", destination: "Mzuzu University" });
});

test("a single place returns { kind: 'single' }", () => {
  assert.deepEqual(parseTypedRoute("Lilongwe"), { kind: "single", place: "Lilongwe" });
  assert.deepEqual(parseTypedRoute("  Nkhata Bay "), { kind: "single", place: "Nkhata Bay" });
});

test("non-route text returns null", () => {
  assert.equal(parseTypedRoute("how much is the fare"), null);
  assert.equal(parseTypedRoute(""), null);
  assert.equal(parseTypedRoute("I want to go somewhere nice next weekend please"), null);
});

test("matchDistrict is case/space insensitive and rejects non-districts", () => {
  assert.equal(matchDistrict("lilongwe"), "Lilongwe");
  assert.equal(matchDistrict("  NKHATA BAY "), "Nkhata Bay");
  assert.equal(matchDistrict("Mzuzu University"), null);
  assert.equal(matchDistrict("Nairobi"), null);
});

test("looksLikeUniversity heuristic", () => {
  assert.equal(looksLikeUniversity("Mzuzu University"), true);
  assert.equal(looksLikeUniversity("LUANAR"), true);
  assert.equal(looksLikeUniversity("Main Campus"), true);
  assert.equal(looksLikeUniversity("Lilongwe"), false);
});
