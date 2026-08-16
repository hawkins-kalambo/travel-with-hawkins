import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireOperatorUser } from "@/lib/operatorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response, "manageRoutes");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const { id } = await params;
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("car_hire_listings")
    .select("*")
    .eq("id", id)
    .eq("operator_id", auth.operatorId)
    .maybeSingle();

  if (lookupError) return jsonError("Unable to load car hire listing", 500);
  if (!existing) return jsonError("Car hire listing not found", 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const updatePayload: Record<string, unknown> = {};

  if (typeof body.dailyRate === "number" && Number.isFinite(body.dailyRate) && body.dailyRate > 0) updatePayload.daily_rate = body.dailyRate;
  if (typeof body.driverIncluded === "boolean") updatePayload.driver_included = body.driverIncluded;
  if (typeof body.status === "string") {
    if (body.status !== "active" && body.status !== "inactive") return jsonError("status must be 'active' or 'inactive'", 400);
    updatePayload.status = body.status;
  }

  if (Object.keys(updatePayload).length === 0) return jsonError("No supported update fields provided", 400);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("car_hire_listings")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (updateError || !updated) return jsonError("Unable to update car hire listing", 500);
  return NextResponse.json({ success: true, carHireListing: updated });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response, "manageRoutes");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const { id } = await params;

  const { data: deleted, error } = await supabaseAdmin
    .from("car_hire_listings")
    .delete()
    .eq("id", id)
    .eq("operator_id", auth.operatorId)
    .select("id")
    .maybeSingle();

  if (error) return jsonError("Unable to delete car hire listing", 500);
  if (!deleted) return jsonError("Car hire listing not found", 404);

  return NextResponse.json({ success: true });
}
