import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySenderKind, confirmedDeliveryStatus, filterToQuery, isInboxFilter, previewFor,
} from "./inbox.ts";

test("classifySenderKind: inbound is always the customer", () => {
  assert.equal(classifySenderKind({ direction: "inbound", sender_id: "x" }), "customer");
});

test("classifySenderKind: provider_metadata.origin wins for outbound", () => {
  assert.equal(classifySenderKind({ direction: "outbound", provider_metadata: { origin: "automatic" } }), "automatic");
  assert.equal(classifySenderKind({ direction: "outbound", provider_metadata: { origin: "agent" } }), "agent");
  assert.equal(classifySenderKind({ direction: "outbound", provider_metadata: { origin: "bot" } }), "bot");
});

test("classifySenderKind: falls back to sender_id when no origin marker", () => {
  assert.equal(classifySenderKind({ direction: "outbound", sender_id: "agent-1" }), "agent");
  assert.equal(classifySenderKind({ direction: "outbound", sender_id: null }), "bot");
});

test("confirmedDeliveryStatus: only provider-confirmed states pass through", () => {
  assert.equal(confirmedDeliveryStatus("delivered"), "delivered");
  assert.equal(confirmedDeliveryStatus("READ"), "read");
  assert.equal(confirmedDeliveryStatus("failed"), "failed");
  assert.equal(confirmedDeliveryStatus("sending"), null);
  assert.equal(confirmedDeliveryStatus("received"), null);
  assert.equal(confirmedDeliveryStatus(null), null);
});

test("previewFor: collapses whitespace and bounds length", () => {
  assert.equal(previewFor("  hello\n  world  "), "hello world");
  assert.equal(previewFor("x".repeat(200)).length, 160);
  assert.equal(previewFor("x".repeat(200)).endsWith("…"), true);
  assert.equal(previewFor(null), "");
});

test("isInboxFilter guards the query param", () => {
  assert.equal(isInboxFilter("waiting"), true);
  assert.equal(isInboxFilter("nope"), false);
  assert.equal(isInboxFilter(undefined), false);
});

test("filterToQuery maps UI filters to list constraints", () => {
  assert.deepEqual(filterToQuery("unread"), { unreadOnly: true });
  assert.deepEqual(filterToQuery("waiting"), { status: "waiting" });
  assert.deepEqual(filterToQuery("human"), { status: "human_controlled" });
  assert.deepEqual(filterToQuery("bot"), { status: "bot_controlled" });
  assert.deepEqual(filterToQuery("resolved"), { status: "resolved" });
  assert.deepEqual(filterToQuery("all"), {});
});
