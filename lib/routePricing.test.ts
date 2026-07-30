import test from "node:test";
import assert from "node:assert/strict";
import { resolveRouteFareIfAvailable } from "./routePricing";

test("resolves fares from route objects in settings payloads", () => {
  const settings = {
    routes: "",
    route_objects: [
      { route_name: "Mzuzu - Lilongwe", fare: 70000 },
      { route_name: "Mzuzu - Blantyre", fare: 120000 },
    ],
  };

  assert.equal(resolveRouteFareIfAvailable("Mzuzu - Lilongwe", settings), 70000);
  assert.equal(resolveRouteFareIfAvailable("Mzuzu - Blantyre", settings), 120000);
});

test("keeps resolving from plain routes text", () => {
  assert.equal(resolveRouteFareIfAvailable("Mzuzu - Lilongwe", "Mzuzu - Lilongwe: 70000\nMzuzu - Blantyre: 120000"), 70000);
});
