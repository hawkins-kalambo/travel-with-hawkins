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
    .from("taxi_fares")
    .select("id, origin_label, destination_label, fare, status, created_at")
    .eq("operator_id", auth.operatorId)
    .order("origin_label", { ascending: true });

  if (error) return jsonError("Unable to load taxi fares", 500);
  return NextResponse.json({ success: true, taxiFares: data ?? [] });
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response, "manageRoutes");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const { data: approval, error: approvalError } = await supabaseAdmin
    .from("service_approvals")
    .select("status")
    .eq("operator_id", auth.operatorId)
    .eq("service_type", "taxi")
    .maybeSingle();

  if (approvalError) return jsonError("Unable to verify taxi service approval", 500);
  if (approval?.status !== "approved") return jsonError("Your taxi service must be approved before you can add fares", 403);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const originLabel = typeof body.originLabel === "string" ? body.originLabel.trim() : "";
  const destinationLabel = typeof body.destinationLabel === "string" ? body.destinationLabel.trim() : "";
  const fare = typeof body.fare === "number" && Number.isFinite(body.fare) && body.fare > 0 ? body.fare : undefined;

  if (!originLabel) return jsonError("originLabel is required", 400);
  if (!destinationLabel) return jsonError("destinationLabel is required", 400);
  if (!fare) return jsonError("fare must be a positive number", 400);

  const { data, error } = await supabaseAdmin
    .from("taxi_fares")
    .insert({ operator_id: auth.operatorId, origin_label: originLabel, destination_label: destinationLabel, fare })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return jsonError("You already have a fare for this leg", 409);
    return jsonError("Unable to create taxi fare", 500);
  }

  return NextResponse.json({ success: true, taxiFare: data });
}
