import test from "node:test";
import assert from "node:assert/strict";

import { hasPermission, isAdminLikeRole, normalizeAppRole } from "./permissions.ts";

test("university_admin is a recognized staff role", () => {
  assert.equal(normalizeAppRole(" university_admin "), "university_admin");
  assert.equal(isAdminLikeRole("university_admin"), true);
});

test("university admins receive booking operations but no global configuration privileges", () => {
  assert.equal(hasPermission("university_admin", "viewBookings"), true);
  assert.equal(hasPermission("university_admin", "manageBookings"), true);
  assert.equal(hasPermission("university_admin", "viewReports"), true);
  assert.equal(hasPermission("university_admin", "manageUsers"), false);
  assert.equal(hasPermission("university_admin", "manageBusinessConfiguration"), false);
  assert.equal(hasPermission("university_admin", "approveCommissions"), false);
});
