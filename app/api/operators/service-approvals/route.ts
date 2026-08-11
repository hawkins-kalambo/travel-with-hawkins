import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireOperatorUser } from "@/lib/operatorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Intercity is granted automatically at registration (see
// lib/operatorRegistration.ts) — this endpoint is only for the services an
// operator has to separately apply for.
const REQUESTABLE_SERVICE_TYPES = ["taxi", "car_hire"] as const;

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response);
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const { data, error } = await supabaseAdmin
    .from("service_approvals")
    .select("id, service_type, status, notes, created_at")
    .eq("operator_id", auth.operatorId)
    .order("created_at", { ascending: false });

  if (error) return jsonError("Unable to load service approvals", 500);
  return NextResponse.json({ success: true, serviceApprovals: data ?? [] });
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response, "manageRoutes");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const serviceType = typeof body.serviceType === "string" ? body.serviceType : "";

  if (!(REQUESTABLE_SERVICE_TYPES as readonly string[]).includes(serviceType)) {
    return jsonError("serviceType must be 'taxi' or 'car_hire'", 400);
  }

  const { data, error } = await supabaseAdmin
    .from("service_approvals")
    .insert({ operator_id: auth.operatorId, service_type: serviceType })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return jsonError("You've already requested this service", 409);
    return jsonError("Unable to request this service", 500);
  }

  return NextResponse.json({ success: true, serviceApproval: data });
}
