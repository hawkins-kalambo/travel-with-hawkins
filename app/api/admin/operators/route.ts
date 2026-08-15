import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const APPLICATION_STATUSES = ["draft", "submitted", "under_review", "changes_required", "approved", "rejected"] as const;
const OPERATOR_STATUSES = ["draft", "approved", "active", "paused", "suspended", "closed"] as const;

type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
type OperatorStatus = (typeof OPERATOR_STATUSES)[number];

async function writeOperatorAudit(args: {
  request: NextRequest;
  actorUserId: string;
  actorRole: string;
  action: string;
  operatorId: string;
  previousValue: unknown;
  newValue: unknown;
}) {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: args.actorUserId,
    actor_role: args.actorRole,
    action: args.action,
    entity_type: "operator",
    entity_id: args.operatorId,
    operator_id: args.operatorId,
    previous_value: args.previousValue,
    new_value: args.newValue,
    ip_address: args.request.headers.get("x-real-ip"),
    user_agent: args.request.headers.get("user-agent"),
  });

  if (error) console.error("Failed to write operator audit log", error);
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, NextResponse.next());
  if (!auth.authorized || !auth.user) return jsonError(auth.error ?? "Admin access required", 403);

  const statusFilter = new URL(request.url).searchParams.get("applicationStatus");

  let query = supabaseAdmin
    .from("operators")
    .select("id, legal_name, display_name, is_individual, contact_name, contact_email, contact_phone, application_status, status, created_at")
    .order("created_at", { ascending: false });

  if (statusFilter && (APPLICATION_STATUSES as readonly string[]).includes(statusFilter)) {
    query = query.eq("application_status", statusFilter);
  }

  const { data, error } = await query;
  if (error) return jsonError("Unable to load operators", 500);

  return NextResponse.json({ success: true, operators: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminUser(request, NextResponse.next());
  if (!auth.authorized || !auth.user) return jsonError(auth.error ?? "Admin access required", 403);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const operatorId = typeof body.operatorId === "string" ? body.operatorId.trim() : "";
  const applicationStatus = typeof body.applicationStatus === "string" ? (body.applicationStatus as ApplicationStatus) : undefined;
  const operatorStatus = typeof body.status === "string" ? (body.status as OperatorStatus) : undefined;
  const suspensionReason = typeof body.suspensionReason === "string" ? body.suspensionReason.trim() : undefined;

  if (!operatorId) return jsonError("operatorId is required", 400);
  if (applicationStatus && !(APPLICATION_STATUSES as readonly string[]).includes(applicationStatus)) {
    return jsonError("Unsupported applicationStatus", 400);
  }
  if (operatorStatus && !(OPERATOR_STATUSES as readonly string[]).includes(operatorStatus)) {
    return jsonError("Unsupported status", 400);
  }
  if (!applicationStatus && !operatorStatus) {
    return jsonError("Provide applicationStatus and/or status", 400);
  }
  if (operatorStatus === "suspended" && (!suspensionReason || suspensionReason.length < 5)) {
    return jsonError("A suspension reason of at least 5 characters is required", 400);
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("operators")
    .select("*")
    .eq("id", operatorId)
    .maybeSingle();

  if (lookupError) return jsonError("Unable to load operator", 500);
  if (!existing) return jsonError("Operator not found", 404);

  const updatePayload: Record<string, unknown> = {};
  if (applicationStatus) {
    updatePayload.application_status = applicationStatus;
    // Approving the application is also the moment the operator becomes a
    // real, active marketplace participant — Master Plan §4.3 treats these
    // as two status models, but there is no meaningful "approved but not
    // yet active" resting state for Wave 1, so this collapses them here
    // rather than requiring a second admin action for the same decision.
    if (applicationStatus === "approved") updatePayload.status = "active";
    if (applicationStatus === "approved") updatePayload.approved_at = new Date().toISOString();
    if (applicationStatus === "approved") updatePayload.approved_by = auth.user.id;
  }
  if (operatorStatus) {
    updatePayload.status = operatorStatus;
    if (operatorStatus === "suspended") {
      updatePayload.suspended_at = new Date().toISOString();
      updatePayload.suspended_by = auth.user.id;
      updatePayload.suspension_reason = suspensionReason;
    }
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("operators")
    .update(updatePayload)
    .eq("id", operatorId)
    .select()
    .maybeSingle();

  if (updateError || !updated) return jsonError("Unable to update operator", 500);

  await writeOperatorAudit({
    request,
    actorUserId: auth.user.id,
    actorRole: auth.role ?? "admin",
    action: applicationStatus === "approved" ? "approve_operator" : operatorStatus === "suspended" ? "suspend_operator" : "update_operator_status",
    operatorId,
    previousValue: existing,
    newValue: updated,
  });

  return NextResponse.json({ success: true, operator: updated });
}
