import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const REVIEW_STATUSES = ["approved", "rejected", "suspended"] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];

async function writeServiceApprovalAudit(args: {
  request: NextRequest;
  actorUserId: string;
  actorRole: string;
  operatorId: string;
  serviceApprovalId: string;
  previousValue: unknown;
  newValue: unknown;
}) {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: args.actorUserId,
    actor_role: args.actorRole,
    action: "update_service_approval",
    entity_type: "service_approval",
    entity_id: args.serviceApprovalId,
    operator_id: args.operatorId,
    previous_value: args.previousValue,
    new_value: args.newValue,
    ip_address: args.request.headers.get("x-real-ip"),
    user_agent: args.request.headers.get("user-agent"),
  });
  if (error) console.error("Failed to write service approval audit log", error);
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, NextResponse.next());
  if (!auth.authorized || !auth.user) return jsonError(auth.error ?? "Admin access required", 403);

  const operatorId = new URL(request.url).searchParams.get("operatorId");
  if (!operatorId) return jsonError("operatorId is required", 400);

  const { data, error } = await supabaseAdmin
    .from("service_approvals")
    .select("id, service_type, status, notes, created_at")
    .eq("operator_id", operatorId)
    .order("created_at", { ascending: false });

  if (error) return jsonError("Unable to load service approvals", 500);
  return NextResponse.json({ success: true, serviceApprovals: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminUser(request, NextResponse.next());
  if (!auth.authorized || !auth.user) return jsonError(auth.error ?? "Admin access required", 403);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const serviceApprovalId = typeof body.serviceApprovalId === "string" ? body.serviceApprovalId.trim() : "";
  const status = typeof body.status === "string" ? (body.status as ReviewStatus) : undefined;
  const notes = typeof body.notes === "string" ? body.notes.trim() : undefined;

  if (!serviceApprovalId) return jsonError("serviceApprovalId is required", 400);
  if (!status || !(REVIEW_STATUSES as readonly string[]).includes(status)) {
    return jsonError("status must be 'approved', 'rejected', or 'suspended'", 400);
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("service_approvals")
    .select("*")
    .eq("id", serviceApprovalId)
    .maybeSingle();

  if (lookupError) return jsonError("Unable to load service approval", 500);
  if (!existing) return jsonError("Service approval not found", 404);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("service_approvals")
    .update({ status, notes: notes ?? existing.notes, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString() })
    .eq("id", serviceApprovalId)
    .select()
    .maybeSingle();

  if (updateError || !updated) return jsonError("Unable to update service approval", 500);

  // A suspended/rejected taxi approval must stop new bookings immediately —
  // taxi_fares has no direct link back to service_approvals for the
  // customer-facing browse query to check, so pull the rug here instead of
  // requiring the operator to remember to deactivate every fare themselves.
  if (updated.service_type === "taxi" && (status === "suspended" || status === "rejected")) {
    const { error: deactivateError } = await supabaseAdmin
      .from("taxi_fares")
      .update({ status: "inactive" })
      .eq("operator_id", existing.operator_id)
      .eq("status", "active");
    if (deactivateError) console.error("Failed to deactivate taxi fares after service approval change", deactivateError);
  }

  await writeServiceApprovalAudit({
    request,
    actorUserId: auth.user.id,
    actorRole: auth.role ?? "admin",
    operatorId: existing.operator_id,
    serviceApprovalId,
    previousValue: existing,
    newValue: updated,
  });

  return NextResponse.json({ success: true, serviceApproval: updated });
}
