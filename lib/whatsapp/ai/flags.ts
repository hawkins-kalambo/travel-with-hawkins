// AI Assistant feature flags (Stage 1). Every AI capability is behind a flag
// that defaults OFF, plus a single kill switch that overrides all of them.
// Flags are read from the environment so an operator can disable a capability
// (or the whole assistant) without a deploy.
//
// The existing `WHATSAPP_AI_PROVIDER` gate is unchanged and independent — it
// still controls the current question-step intent router. These flags gate the
// *new* assistant behaviour introduced from Stage 2 onwards.

export type AiFeature =
  | "assistant"        // the conversational assistant runs at all
  | "liveTools"        // read-only live-data tools (routes, bookings, payments…)
  | "synthesis"        // AI composes the reply from verified facts (with a guard)
  | "bookingDrafts"    // natural-language booking drafts
  | "routeAlternatives"// verified multi-leg suggestions
  | "personalization"  // saved customer preferences / suggestions
  | "voiceNotes"       // voice-note transcription
  | "proactiveNotifications"; // AI-composed proactive messages

const ENV_KEY: Record<AiFeature, string> = {
  assistant: "WHATSAPP_AI_ASSISTANT_ENABLED",
  liveTools: "WHATSAPP_AI_LIVE_TOOLS_ENABLED",
  synthesis: "WHATSAPP_AI_SYNTHESIS_ENABLED",
  bookingDrafts: "WHATSAPP_AI_BOOKING_DRAFTS_ENABLED",
  routeAlternatives: "WHATSAPP_AI_ROUTE_ALTERNATIVES_ENABLED",
  personalization: "WHATSAPP_AI_PERSONALIZATION_ENABLED",
  voiceNotes: "WHATSAPP_AI_VOICE_NOTES_ENABLED",
  proactiveNotifications: "WHATSAPP_AI_PROACTIVE_NOTIFICATIONS_ENABLED",
};

const KILL_SWITCH_KEY = "WHATSAPP_AI_KILL_SWITCH";

function envIsTrue(value: string | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

// The emergency stop: when set, every AI capability is off regardless of the
// individual flags.
export function aiKillSwitchEngaged(env: NodeJS.ProcessEnv = process.env): boolean {
  return envIsTrue(env[KILL_SWITCH_KEY]);
}

export function isAiFeatureEnabled(feature: AiFeature, env: NodeJS.ProcessEnv = process.env): boolean {
  if (aiKillSwitchEngaged(env)) return false;
  // Everything below "assistant" also needs the assistant itself to be on.
  if (feature !== "assistant" && !envIsTrue(env[ENV_KEY.assistant])) return false;
  return envIsTrue(env[ENV_KEY[feature]]);
}

// Snapshot for the admin dashboard / diagnostics — never throws.
export function aiFeatureSnapshot(env: NodeJS.ProcessEnv = process.env): Record<AiFeature | "killSwitch", boolean> {
  return {
    killSwitch: aiKillSwitchEngaged(env),
    assistant: isAiFeatureEnabled("assistant", env),
    liveTools: isAiFeatureEnabled("liveTools", env),
    synthesis: isAiFeatureEnabled("synthesis", env),
    bookingDrafts: isAiFeatureEnabled("bookingDrafts", env),
    routeAlternatives: isAiFeatureEnabled("routeAlternatives", env),
    personalization: isAiFeatureEnabled("personalization", env),
    voiceNotes: isAiFeatureEnabled("voiceNotes", env),
    proactiveNotifications: isAiFeatureEnabled("proactiveNotifications", env),
  };
}
