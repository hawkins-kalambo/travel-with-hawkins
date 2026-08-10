import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canAccessUniversity, requireUniversityOperationsUser } from "@/lib/universityAdminAuth";
import { MALAWI_DISTRICTS } from "@/lib/tripSearchData";
import { jsonError } from "@/lib/apiResponse";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function validDistrict(value: string): boolean {
  return (MALAWI_DISTRICTS as readonly string[]).includes(value);
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
  if (!access.authorized) return jsonError(access.error, access.status);

  const url = new URL(req.url);
  const universityId = text(url.searchParams.get("universityId"));
  const district = text(url.searchParams.get("district"));
  let query = supabaseAdmin
    .from("district_pickup_points")
    .select("*")
    .order("district", { ascending: true })
    .order("label", { ascending: true });

  if (!access.isGlobal) query = query.in("university_id", access.universityIds);
  if (universityId) query = query.eq("university_id", universityId);
  if (district) query = query.eq("district", district);
  const { data, error } = await query;
  if (error) return jsonError(error.message || "Unable to load district pickup points");
  return NextResponse.json({ success: true, pickupPoints: data ?? [] });
}

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
  if (!access.authorized) return jsonError(access.error, access.status);

  const body = (await req.json()) as Record<string, unknown>;
  const universityId = text(body.universityId ?? body.university_id);
  const district = text(body.district);
  const label = text(body.label);
  if (!universityId || !district || !label) return jsonError("universityId, district and label are required", 400);
  if (!validDistrict(district)) return jsonError("district must be a valid Malawi district", 400);
  if (!canAccessUniversity(access, universityId)) return jsonError("This university is outside your assignment", 403);

  const { data, error } = await supabaseAdmin
    .from("district_pickup_points")
    .insert([{ university_id: universityId, district, label, status: body.status === "inactive" ? "inactive" : "active" }])
    .select()
    .single();
  if (error) return jsonError(error.code === "23505" ? "This district pickup point already exists" : error.message, error.code === "23505" ? 409 : 500);
  return NextResponse.json({ success: true, pickupPoint: data });
}

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
  if (!access.authorized) return jsonError(access.error, access.status);

  const body = (await req.json()) as Record<string, unknown>;
  const id = text(body.id);
  if (!id) return jsonError("id is required", 400);
  const { data: current, error: currentError } = await supabaseAdmin
    .from("district_pickup_points")
    .select("id, university_id")
    .eq("id", id)
    .maybeSingle();
  if (currentError) return jsonError(currentError.message);
  if (!current) return jsonError("District pickup point not found", 404);
  if (!canAccessUniversity(access, current.university_id)) return jsonError("This pickup point is outside your assignment", 403);

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const label = text(body.label);
  if (label) payload.label = label;
  if (body.status === "active" || body.status === "inactive") payload.status = body.status;
  if (Object.keys(payload).length === 1) return jsonError("No valid fields provided", 400);
  const { data, error } = await supabaseAdmin
    .from("district_pickup_points")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) return jsonError(error.code === "23505" ? "This district pickup point already exists" : error.message, error.code === "23505" ? 409 : 500);
  return NextResponse.json({ success: true, pickupPoint: data });
}

export async function DELETE(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
  if (!access.authorized) return jsonError(access.error, access.status);
  const body = (await req.json()) as Record<string, unknown>;
  const id = text(body.id);
  if (!id) return jsonError("id is required", 400);
  const { data: current } = await supabaseAdmin.from("district_pickup_points").select("university_id").eq("id", id).maybeSingle();
  if (!current) return jsonError("District pickup point not found", 404);
  if (!canAccessUniversity(access, current.university_id)) return jsonError("This pickup point is outside your assignment", 403);
  const { error } = await supabaseAdmin.from("district_pickup_points").delete().eq("id", id);
  if (error) return jsonError(error.code === "23503" ? "This pickup point is used by a route; deactivate it instead" : error.message, error.code === "23503" ? 409 : 500);
  return NextResponse.json({ success: true });
}
