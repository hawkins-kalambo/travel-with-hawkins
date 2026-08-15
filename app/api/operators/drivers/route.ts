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
    .from("drivers")
    .select("id, full_name, phone, license_number, status, created_at")
    .eq("operator_id", auth.operatorId)
    .order("created_at", { ascending: false });

  if (error) return jsonError("Unable to load drivers", 500);
  return NextResponse.json({ success: true, drivers: data ?? [] });
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response, "manageDrivers");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const licenseNumber = typeof body.licenseNumber === "string" ? body.licenseNumber.trim().toUpperCase() : "";

  if (!fullName) return jsonError("fullName is required", 400);
  if (!phone) return jsonError("phone is required", 400);
  if (!licenseNumber) return jsonError("licenseNumber is required", 400);

  const { data, error } = await supabaseAdmin
    .from("drivers")
    .insert({
      operator_id: auth.operatorId,
      full_name: fullName,
      phone,
      license_number: licenseNumber,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return jsonError("A driver with this license number already exists", 409);
    return jsonError("Unable to create driver", 500);
  }

  return NextResponse.json({ success: true, driver: data });
}
