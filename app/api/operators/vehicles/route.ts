import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireOperatorUser } from "@/lib/operatorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SERVICE_TYPES = ["intercity", "taxi", "car_hire"] as const;

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response);
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const { data, error } = await supabaseAdmin
    .from("vehicles")
    .select("id, service_type, registration_number, make, model, capacity, status, created_at")
    .eq("operator_id", auth.operatorId)
    .order("created_at", { ascending: false });

  if (error) return jsonError("Unable to load vehicles", 500);
  return NextResponse.json({ success: true, vehicles: data ?? [] });
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response, "manageVehicles");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const serviceType = typeof body.serviceType === "string" ? body.serviceType : "";
  const registrationNumber = typeof body.registrationNumber === "string" ? body.registrationNumber.trim().toUpperCase() : "";
  const make = typeof body.make === "string" ? body.make.trim() : null;
  const model = typeof body.model === "string" ? body.model.trim() : null;
  const capacity = typeof body.capacity === "number" && Number.isInteger(body.capacity) && body.capacity > 0 ? body.capacity : null;

  if (!(SERVICE_TYPES as readonly string[]).includes(serviceType)) return jsonError("Unsupported serviceType", 400);
  if (!registrationNumber) return jsonError("registrationNumber is required", 400);

  const { data, error } = await supabaseAdmin
    .from("vehicles")
    .insert({
      operator_id: auth.operatorId,
      service_type: serviceType,
      registration_number: registrationNumber,
      make,
      model,
      capacity,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return jsonError("A vehicle with this registration number already exists", 409);
    return jsonError("Unable to create vehicle", 500);
  }

  return NextResponse.json({ success: true, vehicle: data });
}
