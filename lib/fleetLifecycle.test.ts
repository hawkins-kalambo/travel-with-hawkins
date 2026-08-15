import test from "node:test";
import assert from "node:assert/strict";

import {
  canAdminTransitionDriver,
  canAdminTransitionVehicle,
  canOperatorTransitionDriver,
  canOperatorTransitionVehicle,
  parseDriverStatus,
  parseVehicleStatus,
} from "./fleetLifecycle.ts";

test("parseVehicleStatus/parseDriverStatus reject anything outside the known enum", () => {
  assert.equal(parseVehicleStatus("active"), "active");
  assert.equal(parseVehicleStatus("scrapped"), null);
  assert.equal(parseVehicleStatus(undefined), null);
  assert.equal(parseDriverStatus("verified"), "verified");
  assert.equal(parseDriverStatus("retired"), null);
});

test("the compliance gate (pending -> active/verified) is admin-only, never operator-controlled", () => {
  assert.equal(canOperatorTransitionVehicle("pending", "active"), false);
  assert.equal(canAdminTransitionVehicle("pending", "active"), true);
  assert.equal(canOperatorTransitionDriver("pending", "verified"), false);
  assert.equal(canAdminTransitionDriver("pending", "verified"), true);
});

test("operators can toggle between states they've already earned", () => {
  assert.equal(canOperatorTransitionVehicle("active", "maintenance"), true);
  assert.equal(canOperatorTransitionVehicle("maintenance", "active"), true);
  assert.equal(canOperatorTransitionDriver("verified", "inactive"), true);
  assert.equal(canOperatorTransitionDriver("inactive", "verified"), true);
});

test("operators can retire/stand down what they own, but never resurrect a retired vehicle", () => {
  assert.equal(canOperatorTransitionVehicle("pending", "retired"), true);
  assert.equal(canOperatorTransitionVehicle("active", "retired"), true);
  assert.equal(canOperatorTransitionVehicle("retired", "active"), false);
});

test("operators can never lift a suspension themselves", () => {
  assert.equal(canOperatorTransitionVehicle("suspended", "active"), false);
  assert.equal(canOperatorTransitionDriver("suspended", "verified"), false);
  assert.equal(canAdminTransitionVehicle("suspended", "active"), true);
  assert.equal(canAdminTransitionDriver("suspended", "verified"), true);
});

test("admins cannot resurrect a retired vehicle either - it's terminal", () => {
  assert.equal(canAdminTransitionVehicle("retired", "active"), false);
});

test("expired-document/licence states require admin re-verification, not operator self-service", () => {
  assert.equal(canOperatorTransitionVehicle("expired_documents", "active"), false);
  assert.equal(canAdminTransitionVehicle("expired_documents", "active"), true);
  assert.equal(canOperatorTransitionDriver("expired_licence", "verified"), false);
  assert.equal(canAdminTransitionDriver("expired_licence", "verified"), true);
});
