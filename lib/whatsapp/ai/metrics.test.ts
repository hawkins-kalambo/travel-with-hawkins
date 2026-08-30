import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

let rows: unknown[];
let queryError: unknown;

function builder() {
  const chain: Record<string, unknown> = {
    select() { return chain; },
    gte() { return chain; },
    limit() { return Promise.resolve(queryError ? { data: null, error: queryError } : { data: rows, error: null }); },
  };
  return chain;
}
mock.module("@/lib/supabaseAdmin", { exports: { supabaseAdmin: { from: () => builder() } } });

const { aiQualitySummary } = await import("./metrics.ts");

beforeEach(() => {
  queryError = null;
  rows = [
    { detected_intent: "fare_question", detected_language: "en", tool_outcome: "ok", fallback_used: false, clarification_requested: false, human_requested: false, urgency: "normal", response_ms: 400, feedback: "helpful" },
    { detected_intent: "unknown", detected_language: "ny", tool_outcome: "none", fallback_used: true, clarification_requested: false, human_requested: false, urgency: "normal", response_ms: 100, feedback: null },
    { detected_intent: "my_bookings", detected_language: "en", tool_outcome: "denied", fallback_used: true, clarification_requested: true, human_requested: false, urgency: "normal", response_ms: null, feedback: "needs_improvement" },
    { detected_intent: "urgent_support", detected_language: "en", tool_outcome: "none", fallback_used: false, clarification_requested: false, human_requested: true, urgency: "urgent", response_ms: 0, feedback: null },
  ];
});

test("aggregates rates and counts over the window", async () => {
  const s = await aiQualitySummary(30);
  assert.equal(s.turns, 4);
  assert.equal(s.fallbackRate, 0.5);
  assert.equal(s.unknownIntentRate, 0.25);
  assert.equal(s.clarificationRate, 0.25);
  assert.equal(s.humanHandoverRate, 0.25);
  assert.equal(s.toolDenied, 1);
  assert.equal(s.urgent, 1);
  assert.deepEqual(s.byLanguage, { en: 3, ny: 1 });
  assert.equal(s.avgResponseMs, Math.round((400 + 100 + 0) / 3));
  assert.equal(s.feedbackHelpful, 1);
  assert.equal(s.feedbackNeedsHelp, 1);
  assert.equal(s.topIntents[0].count >= s.topIntents[s.topIntents.length - 1].count, true);
});

test("no rows -> a zeroed summary", async () => {
  rows = [];
  const s = await aiQualitySummary(7);
  assert.equal(s.turns, 0);
  assert.equal(s.windowDays, 7);
  assert.equal(s.avgResponseMs, null);
});

test("a query error -> a zeroed summary, never throws", async () => {
  queryError = { code: "42P01" };
  const s = await aiQualitySummary(30);
  assert.equal(s.turns, 0);
});

test("window is clamped to 1..365 days", async () => {
  assert.equal((await aiQualitySummary(0)).windowDays, 1);
  assert.equal((await aiQualitySummary(9999)).windowDays, 365);
});
