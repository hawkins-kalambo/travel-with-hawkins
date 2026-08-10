import test from "node:test";
import assert from "node:assert/strict";

import { getOperatorRolePermissions, hasOperatorPermission, normalizeOperatorStaffRole } from "./operatorPermissions.ts";

test("normalizeOperatorStaffRole recognizes every staff role, case/whitespace-insensitively", () => {
  assert.equal(normalizeOperatorStaffRole(" Owner "), "owner");
  assert.equal(normalizeOperatorStaffRole("MANAGER"), "manager");
  assert.equal(normalizeOperatorStaffRole("dispatcher"), "dispatcher");
  assert.equal(normalizeOperatorStaffRole("finance_officer"), "finance_officer");
  assert.equal(normalizeOperatorStaffRole("booking_agent"), "booking_agent");
  assert.equal(normalizeOperatorStaffRole("driver"), "driver");
});

test("normalizeOperatorStaffRole rejects unknown or non-string values", () => {
  assert.equal(normalizeOperatorStaffRole("super_admin"), null);
  assert.equal(normalizeOperatorStaffRole(""), null);
  assert.equal(normalizeOperatorStaffRole(undefined), null);
  assert.equal(normalizeOperatorStaffRole(123), null);
});

test("owner has complete operator control", () => {
  assert.equal(hasOperatorPermission("owner", "manageStaff"), true);
  assert.equal(hasOperatorPermission("owner", "manageFinance"), true);
  assert.equal(hasOperatorPermission("owner", "manageVehicles"), true);
});

test("dispatcher gets trips/manifests but not staff or finance (Master Plan §4.4)", () => {
  assert.equal(hasOperatorPermission("dispatcher", "manageTrips"), true);
  assert.equal(hasOperatorPermission("dispatcher", "viewManifests"), true);
  assert.equal(hasOperatorPermission("dispatcher", "manageStaff"), false);
  assert.equal(hasOperatorPermission("dispatcher", "manageFinance"), false);
});

test("finance_officer is scoped to payments only, not fleet or staff", () => {
  assert.equal(hasOperatorPermission("finance_officer", "manageFinance"), true);
  assert.equal(hasOperatorPermission("finance_officer", "manageVehicles"), false);
  assert.equal(hasOperatorPermission("finance_officer", "manageStaff"), false);
  assert.equal(hasOperatorPermission("finance_officer", "manageBookings"), false);
});

test("booking_agent can manage bookings but nothing about the fleet", () => {
  assert.equal(hasOperatorPermission("booking_agent", "manageBookings"), true);
  assert.equal(hasOperatorPermission("booking_agent", "manageVehicles"), false);
  assert.equal(hasOperatorPermission("booking_agent", "manageTrips"), false);
});

test("driver is limited to their own assigned scope", () => {
  assert.equal(hasOperatorPermission("driver", "viewManifests"), true);
  assert.equal(hasOperatorPermission("driver", "reportIncidents"), true);
  assert.equal(hasOperatorPermission("driver", "manageBookings"), false);
  assert.equal(hasOperatorPermission("driver", "manageVehicles"), false);
});

test("an unrecognized role has zero permissions rather than throwing", () => {
  assert.deepEqual(getOperatorRolePermissions("not_a_real_role"), []);
  assert.equal(hasOperatorPermission("not_a_real_role", "viewDashboard"), false);
});

test("every staff role can view the dashboard and manage their own profile", () => {
  for (const role of ["owner", "manager", "dispatcher", "finance_officer", "booking_agent", "driver"]) {
    assert.equal(hasOperatorPermission(role, "viewDashboard"), true, `${role} should see the dashboard`);
    assert.equal(hasOperatorPermission(role, "manageOwnProfile"), true, `${role} should manage their own profile`);
  }
});
