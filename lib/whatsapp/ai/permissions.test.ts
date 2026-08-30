import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_FORBIDDEN_ACTIONS, AI_TOOL_PERMISSIONS, getToolPermission, isKnownTool,
} from "./permissions.ts";

test("every tool has a scope and a summary", () => {
  for (const [name, perm] of Object.entries(AI_TOOL_PERMISSIONS)) {
    assert.ok(["public", "customer", "write"].includes(perm.scope), `${name} scope`);
    assert.ok(perm.summary && perm.summary.length > 3, `${name} summary`);
  }
});

test("no read tool is scoped 'write', no write tool is scoped 'public'", () => {
  assert.equal(AI_TOOL_PERMISSIONS.searchActiveRoutes.scope, "public");
  assert.equal(AI_TOOL_PERMISSIONS.getCustomerBookings.scope, "customer");
  assert.equal(AI_TOOL_PERMISSIONS.confirmBookingDraft.scope, "write");
});

test("only the final booking step needs a confirmation token", () => {
  assert.equal(AI_TOOL_PERMISSIONS.confirmBookingDraft.requiresConfirmationToken, true);
  assert.equal(AI_TOOL_PERMISSIONS.createBookingDraft.requiresConfirmationToken, undefined);
  assert.equal(AI_TOOL_PERMISSIONS.getPublicFare.requiresConfirmationToken, undefined);
});

test("unknown tool names resolve to null", () => {
  assert.equal(getToolPermission("dropAllTables"), null);
  assert.equal(getToolPermission("__proto__"), null);
  assert.equal(isKnownTool("searchActiveRoutes"), true);
  assert.equal(isKnownTool("markPaymentPaid"), false);
});

test("the forbidden-actions list names the things the AI must never do", () => {
  for (const phrase of ["mark a payment as paid", "issue a refund", "change a fare", "delete a booking"]) {
    assert.ok(AI_FORBIDDEN_ACTIONS.includes(phrase), phrase);
  }
  // None of those appear as a callable tool.
  for (const forbidden of ["markPaymentPaid", "issueRefund", "changeFare", "deleteBooking", "activateRoute"]) {
    assert.equal(isKnownTool(forbidden), false, forbidden);
  }
});
