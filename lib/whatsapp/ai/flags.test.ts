import assert from "node:assert/strict";
import test from "node:test";

import { aiFeatureSnapshot, aiKillSwitchEngaged, isAiFeatureEnabled } from "./flags.ts";

const on = (extra: Record<string, string> = {}) => ({
  WHATSAPP_AI_ASSISTANT_ENABLED: "true", ...extra,
}) as unknown as NodeJS.ProcessEnv;

test("every feature defaults OFF", () => {
  const env = {} as NodeJS.ProcessEnv;
  assert.equal(isAiFeatureEnabled("assistant", env), false);
  assert.equal(isAiFeatureEnabled("liveTools", env), false);
  assert.equal(isAiFeatureEnabled("bookingDrafts", env), false);
  assert.equal(isAiFeatureEnabled("voiceNotes", env), false);
});

test("a sub-feature needs the assistant itself to be on", () => {
  const env = { WHATSAPP_AI_LIVE_TOOLS_ENABLED: "true" } as unknown as NodeJS.ProcessEnv;
  assert.equal(isAiFeatureEnabled("liveTools", env), false, "assistant flag missing");
  assert.equal(isAiFeatureEnabled("liveTools", on({ WHATSAPP_AI_LIVE_TOOLS_ENABLED: "true" })), true);
});

test("truthy spellings are accepted; anything else is off", () => {
  for (const v of ["true", "1", "yes", "on", "TRUE", "  On "]) {
    assert.equal(isAiFeatureEnabled("assistant", { WHATSAPP_AI_ASSISTANT_ENABLED: v } as unknown as NodeJS.ProcessEnv), true, v);
  }
  for (const v of ["false", "0", "", "off", "enabled?"]) {
    assert.equal(isAiFeatureEnabled("assistant", { WHATSAPP_AI_ASSISTANT_ENABLED: v } as unknown as NodeJS.ProcessEnv), false, v);
  }
});

test("the kill switch overrides every flag", () => {
  const env = on({
    WHATSAPP_AI_KILL_SWITCH: "true",
    WHATSAPP_AI_LIVE_TOOLS_ENABLED: "true",
    WHATSAPP_AI_BOOKING_DRAFTS_ENABLED: "true",
  });
  assert.equal(aiKillSwitchEngaged(env), true);
  assert.equal(isAiFeatureEnabled("assistant", env), false);
  assert.equal(isAiFeatureEnabled("liveTools", env), false);
  const snap = aiFeatureSnapshot(env);
  assert.equal(snap.killSwitch, true);
  assert.equal(Object.values(snap).filter((v, i) => i > 0 && v === true).length, 0, "nothing else is on");
});

test("snapshot reflects the enabled set", () => {
  const snap = aiFeatureSnapshot(on({ WHATSAPP_AI_LIVE_TOOLS_ENABLED: "1", WHATSAPP_AI_PERSONALIZATION_ENABLED: "yes" }));
  assert.deepEqual(snap, {
    killSwitch: false, assistant: true, liveTools: true, synthesis: false, bookingDrafts: false,
    routeAlternatives: false, personalization: true, voiceNotes: false, proactiveNotifications: false,
  });
});
