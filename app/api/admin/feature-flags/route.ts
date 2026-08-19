import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isFeatureFlagKey, listFeatureFlags } from "@/lib/featureFlags";

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, NextResponse.next());
  if (!auth.authorized || !auth.user) return jsonError(auth.error ?? "Admin access required", 403);

  try {
    const flags = await listFeatureFlags();
    return NextResponse.json({ success: true, flags });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to load feature flags", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminUser(request, NextResponse.next());
  if (!auth.authorized || !auth.user) return jsonError(auth.error ?? "Admin access required", 403);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const key = typeof body.key === "string" ? body.key : "";
  const enabled = typeof body.enabled === "boolean" ? body.enabled : undefined;

  if (!isFeatureFlagKey(key)) return jsonError("Unsupported feature flag key", 400);
  if (enabled === undefined) return jsonError("enabled (boolean) is required", 400);

  const { data: existing, error: lookupError } = await supabaseAdmin.from("feature_flags").select("*").eq("key", key).maybeSingle();
  if (lookupError) return jsonError("Unable to load feature flag", 500);
  if (!existing) return jsonError("Feature flag not found", 404);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("feature_flags")
    .update({ enabled, updated_by: auth.user.id })
    .eq("key", key)
    .select()
    .maybeSingle();

  if (updateError || !updated) return jsonError("Unable to update feature flag", 500);

  const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    actor_role: auth.role ?? "admin",
    action: enabled ? "enable_feature_flag" : "disable_feature_flag",
    entity_type: "feature_flag",
    entity_id: existing.id,
    previous_value: existing,
    new_value: updated,
    ip_address: request.headers.get("x-real-ip"),
    user_agent: request.headers.get("user-agent"),
  });
  if (auditError) console.error("Failed to write feature flag audit log", auditError);

  return NextResponse.json({ success: true, flag: updated });
}
