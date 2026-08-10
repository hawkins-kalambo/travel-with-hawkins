import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireOperatorUser } from "@/lib/operatorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canOperatorTransitionDriver, parseDriverStatus } from "@/lib/fleetLifecycle";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response, "manageDrivers");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const { id } = await params;
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("drivers")
    .select("*")
    .eq("id", id)
    .eq("operator_id", auth.operatorId)
    .maybeSingle();

  if (lookupError) return jsonError("Unable to load driver", 500);
  if (!existing) return jsonError("Driver not found", 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const updatePayload: Record<string, unknown> = {};

  if (typeof body.fullName === "string" && body.fullName.trim()) updatePayload.full_name = body.fullName.trim();
  if (typeof body.phone === "string" && body.phone.trim()) updatePayload.phone = body.phone.trim();

  if (body.status !== undefined) {
    const currentStatus = parseDriverStatus(existing.status);
    const nextStatus = parseDriverStatus(body.status);
    if (!currentStatus || !nextStatus) return jsonError("Unsupported status", 400);
    if (!canOperatorTransitionDriver(currentStatus, nextStatus)) {
      return jsonError(`Cannot move a driver from ${currentStatus} to ${nextStatus}`, 409);
    }
    updatePayload.status = nextStatus;
  }

  if (Object.keys(updatePayload).length === 0) return jsonError("No supported update fields provided", 400);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("drivers")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (updateError || !updated) return jsonError("Unable to update driver", 500);
  return NextResponse.json({ success: true, driver: updated });
}

// Same "undo, not delete" posture as vehicles — only while still pending.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response, "manageDrivers");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const { id } = await params;

  const { data: deleted, error } = await supabaseAdmin
    .from("drivers")
    .delete()
    .eq("id", id)
    .eq("operator_id", auth.operatorId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) return jsonError("Unable to delete driver", 500);
  if (!deleted) return jsonError("Only pending drivers can be removed this way", 409);

  return NextResponse.json({ success: true });
}
