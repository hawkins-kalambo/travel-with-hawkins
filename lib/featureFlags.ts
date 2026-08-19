import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logWarn } from "@/lib/logger";

// The seven flags named in the Phase 3 spec. Four gate already-live
// functionality (turning one off is a real kill-switch); three gate
// not-yet-built functionality (turning one on is a launch action). See
// db/migrations/2026_08_20_launch_safety_controls.sql for the seed values
// and reasoning.
export const FEATURE_FLAG_KEYS = [
  "student_booking_enabled",
  "public_intercity_enabled",
  "taxi_enabled",
  "car_hire_enabled",
  "operator_intercity_portal_enabled",
  "multi_operator_comparison_enabled",
  "wave1_multi_corridor_launch_enabled",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

// Mirrors the migration's seed values exactly — used as the fallback when
// the DB can't be reached, not as the source of truth (the table is).
const FEATURE_FLAG_DEFAULTS: Record<FeatureFlagKey, boolean> = {
  student_booking_enabled: true,
  public_intercity_enabled: true,
  taxi_enabled: true,
  car_hire_enabled: true,
  operator_intercity_portal_enabled: false,
  multi_operator_comparison_enabled: false,
  wave1_multi_corridor_launch_enabled: false,
};

export function isFeatureFlagKey(value: unknown): value is FeatureFlagKey {
  return typeof value === "string" && (FEATURE_FLAG_KEYS as readonly string[]).includes(value);
}

// Fails open to the hardcoded default on a DB error rather than blocking
// every booking on a transient outage — same philosophy already documented
// at claim_booking_dedupe's call site in app/api/bookings/route.ts ("a
// dedupe check outage must never block legitimate booking submissions").
// A missing/never-seeded row is treated the same as a DB error: default to
// the hardcoded value rather than silently disabling a live service.
export async function isFeatureEnabled(key: FeatureFlagKey): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.from("feature_flags").select("enabled").eq("key", key).maybeSingle();
    if (error) {
      logWarn("Feature flag lookup failed; falling back to default", { key, error: error.message });
      return FEATURE_FLAG_DEFAULTS[key];
    }
    if (!data) return FEATURE_FLAG_DEFAULTS[key];
    return data.enabled === true;
  } catch (error) {
    logWarn("Feature flag lookup threw; falling back to default", { key, error: error instanceof Error ? error.message : String(error) });
    return FEATURE_FLAG_DEFAULTS[key];
  }
}

export async function listFeatureFlags(): Promise<
  Array<{ key: string; enabled: boolean; description: string | null; updatedAt: string | null }>
> {
  const { data, error } = await supabaseAdmin.from("feature_flags").select("key, enabled, description, updated_at").order("key");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    key: row.key,
    enabled: row.enabled,
    description: row.description ?? null,
    updatedAt: row.updated_at ?? null,
  }));
}
