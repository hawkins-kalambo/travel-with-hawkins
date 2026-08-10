import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireOperatorUser } from "@/lib/operatorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeOperatorStaffRole } from "@/lib/operatorPermissions";
import { countActiveOwners } from "@/lib/operatorStaff";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response, "manageStaff");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const { id } = await params;
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("operator_memberships")
    .select("*")
    .eq("id", id)
    .eq("operator_id", auth.operatorId)
    .maybeSingle();

  if (lookupError) return jsonError("Unable to load staff member", 500);
  if (!existing) return jsonError("Staff member not found", 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const requestedStatus = typeof body.status === "string" ? body.status : undefined;
  const requestedRole = body.staffRole !== undefined ? normalizeOperatorStaffRole(body.staffRole) : undefined;

  if (requestedStatus !== undefined && requestedStatus !== "active" && requestedStatus !== "suspended") {
    return jsonError("Unsupported status", 400);
  }
  if (body.staffRole !== undefined && !requestedRole) {
    return jsonError("Unsupported staffRole", 400);
  }
  if (requestedStatus === undefined && requestedRole === undefined) {
    return jsonError("Provide status and/or staffRole", 400);
  }

  // Only an owner can touch another owner's role/status, or promote anyone
  // to owner — a manager granting themselves or a peer ownership would be a
  // privilege escalation.
  const touchesOwnerRole = existing.staff_role === "owner" || requestedRole === "owner";
  if (touchesOwnerRole && auth.staffRole !== "owner") {
    return jsonError("Only an owner can change ownership", 403);
  }

  // An operator with zero active owners can never manage staff again
  // through normal self-service. Block whichever change would produce that.
  const removingOwnerStatus = existing.staff_role === "owner" && requestedStatus === "suspended";
  const removingOwnerRole = existing.staff_role === "owner" && requestedRole && requestedRole !== "owner";
  if (removingOwnerStatus || removingOwnerRole) {
    const remainingOwners = await countActiveOwners(auth.operatorId, existing.user_id);
    if (remainingOwners === 0) {
      return jsonError("This operator must always have at least one active owner", 409);
    }
  }

  const updatePayload: Record<string, unknown> = {};
  if (requestedStatus !== undefined) updatePayload.status = requestedStatus;
  if (requestedRole !== undefined) updatePayload.staff_role = requestedRole;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("operator_memberships")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (updateError || !updated) return jsonError("Unable to update staff member", 500);

  await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: auth.user.id,
    actor_role: "operator_staff",
    action: "update_operator_staff",
    entity_type: "operator_membership",
    entity_id: id,
    operator_id: auth.operatorId,
    previous_value: existing,
    new_value: updated,
  });

  return NextResponse.json({ success: true, membership: updated });
}
