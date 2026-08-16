import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireOperatorUser } from "@/lib/operatorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response);
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const { data, error } = await supabaseAdmin
    .from("car_hire_listings")
    .select("id, daily_rate, driver_included, status, created_at, vehicle:vehicles(id, registration_number, make, model, capacity)")
    .eq("operator_id", auth.operatorId)
    .order("created_at", { ascending: false });

  if (error) return jsonError("Unable to load car hire listings", 500);
  return NextResponse.json({ success: true, carHireListings: data ?? [] });
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response, "manageRoutes");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const { data: approval, error: approvalError } = await supabaseAdmin
    .from("service_approvals")
    .select("status")
    .eq("operator_id", auth.operatorId)
    .eq("service_type", "car_hire")
    .maybeSingle();

  if (approvalError) return jsonError("Unable to verify car hire service approval", 500);
  if (approval?.status !== "approved") return jsonError("Your car hire service must be approved before you can list vehicles", 403);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const vehicleId = typeof body.vehicleId === "string" ? body.vehicleId.trim() : "";
  const dailyRate = typeof body.dailyRate === "number" && Number.isFinite(body.dailyRate) && body.dailyRate > 0 ? body.dailyRate : undefined;
  const driverIncluded = body.driverIncluded === true;

  if (!vehicleId) return jsonError("vehicleId is required", 400);
  if (!dailyRate) return jsonError("dailyRate must be a positive number", 400);

  const { data: vehicle, error: vehicleError } = await supabaseAdmin
    .from("vehicles")
    .select("id, service_type, status")
    .eq("id", vehicleId)
    .eq("operator_id", auth.operatorId)
    .maybeSingle();

  if (vehicleError) return jsonError("Unable to verify vehicle", 500);
  if (!vehicle) return jsonError("Vehicle not found", 404);
  if (vehicle.service_type !== "car_hire") return jsonError("Only vehicles registered for car hire can be listed", 400);
  if (vehicle.status !== "active") return jsonError("This vehicle must be admin-verified before it can be listed", 403);

  const { data, error } = await supabaseAdmin
    .from("car_hire_listings")
    .insert({ operator_id: auth.operatorId, vehicle_id: vehicleId, daily_rate: dailyRate, driver_included: driverIncluded })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return jsonError("This vehicle already has a listing", 409);
    return jsonError("Unable to create car hire listing", 500);
  }

  return NextResponse.json({ success: true, carHireListing: data });
}
