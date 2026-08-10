import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireOperatorUser } from "@/lib/operatorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canOperatorTransitionVehicle, parseVehicleStatus } from "@/lib/fleetLifecycle";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response, "manageVehicles");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const { id } = await params;
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .eq("operator_id", auth.operatorId)
    .maybeSingle();

  if (lookupError) return jsonError("Unable to load vehicle", 500);
  if (!existing) return jsonError("Vehicle not found", 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const updatePayload: Record<string, unknown> = {};

  if (typeof body.make === "string") updatePayload.make = body.make.trim();
  if (typeof body.model === "string") updatePayload.model = body.model.trim();
  if (typeof body.capacity === "number" && Number.isInteger(body.capacity) && body.capacity > 0) updatePayload.capacity = body.capacity;

  if (body.status !== undefined) {
    const currentStatus = parseVehicleStatus(existing.status);
    const nextStatus = parseVehicleStatus(body.status);
    if (!currentStatus || !nextStatus) return jsonError("Unsupported status", 400);
    if (!canOperatorTransitionVehicle(currentStatus, nextStatus)) {
      return jsonError(`Cannot move a vehicle from ${currentStatus} to ${nextStatus}`, 409);
    }
    updatePayload.status = nextStatus;
  }

  if (Object.keys(updatePayload).length === 0) return jsonError("No supported update fields provided", 400);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("vehicles")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (updateError || !updated) return jsonError("Unable to update vehicle", 500);
  return NextResponse.json({ success: true, vehicle: updated });
}

// Only ever allowed while still pending — an undo for a mistaken entry,
// not a general delete. Once a vehicle has been through any admin action
// (or even briefly active), it's retired instead (see fleetLifecycle.ts),
// same "no hard deletes of real history" posture as bookings.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response, "manageVehicles");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const { id } = await params;

  const { data: deleted, error } = await supabaseAdmin
    .from("vehicles")
    .delete()
    .eq("id", id)
    .eq("operator_id", auth.operatorId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) return jsonError("Unable to delete vehicle", 500);
  if (!deleted) return jsonError("Only pending vehicles can be removed this way", 409);

  return NextResponse.json({ success: true });
}
