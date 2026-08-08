import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logError } from "@/lib/logger";
import { canAccessUniversity, requireUniversityOperationsUser } from "@/lib/universityAdminAuth";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isValidStatus(value: unknown): value is "active" | "inactive" {
  return value === "active" || value === "inactive";
}

type PickupPointInput = { id?: string; label?: string; status?: string };

function toPickupPointInputs(value: unknown): PickupPointInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      id: toStringValue(item.id),
      label: toStringValue(item.label),
      status: toStringValue(item.status),
    }));
}

// Every pickup point a customer or the routes-and-fares admin UI can already
// see is referenced by `routes.pickup_point_id`, so this endpoint only ever
// updates an existing pickup point in place (matched by id) or inserts a new
// one — never deletes/replaces the set wholesale. Deleting and re-inserting
// (the pattern the old settings.route_objects editor used for the whole
// routes array) would orphan any route already pointing at the old id.
async function upsertPickupPoints(universityId: string, pickupPoints: PickupPointInput[]) {
  for (const point of pickupPoints) {
    const label = point.label;
    const status = isValidStatus(point.status) ? point.status : undefined;
    if (!label && !point.id) continue;

    if (point.id) {
      const payload: Record<string, unknown> = {};
      if (label) payload.label = label;
      if (status) payload.status = status;
      if (Object.keys(payload).length === 0) continue;

      const { error } = await supabaseAdmin
        .from("university_pickup_points")
        .update(payload)
        .eq("id", point.id)
        .eq("university_id", universityId);
      if (error) throw error;
    } else if (label) {
      const { error } = await supabaseAdmin
        .from("university_pickup_points")
        .upsert(
          { university_id: universityId, label, status: status ?? "active" },
          { onConflict: "university_id,label" }
        );
      if (error) throw error;
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const managedScope = url.searchParams.get("scope") === "managed";

    let scopedUniversityIds: string[] | null = null;
    if (managedScope) {
      const response = NextResponse.next();
      const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
      if (!access.authorized) return jsonError(access.error, access.status);
      if (!access.isGlobal) scopedUniversityIds = access.universityIds;
    }

    let query = supabaseAdmin
      .from("universities")
      .select("*, pickupPoints:university_pickup_points(*)")
      .order("name", { ascending: true });

    if (status) query = query.eq("status", status);
    if (scopedUniversityIds) query = query.in("id", scopedUniversityIds);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, universities: data ?? [] });
  } catch (error) {
    logError("Failed to load universities", { error });
    return jsonError(error instanceof Error ? error.message : "Failed to load universities");
  }
}

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const { authorized, error: authError } = await requireAdminUser(req, response);
  if (!authorized) return jsonError(authError || "Unauthorized", 401);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const name = toStringValue(body.name);
    const shortCode = toStringValue(body.shortCode ?? body.short_code);
    const town = toStringValue(body.town);
    const status = isValidStatus(body.status) ? body.status : "active";
    const pickupPoints = toPickupPointInputs(body.pickupPoints ?? body.pickup_points);

    if (!name || !shortCode || !town) {
      return jsonError("name, shortCode and town are required", 400);
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("universities")
      .insert([{ name, short_code: shortCode, town, status }])
      .select()
      .single();

    if (insertError) throw insertError;

    if (pickupPoints.length > 0) {
      await upsertPickupPoints(inserted.id, pickupPoints);
    }

    const { data: withPoints, error: reloadError } = await supabaseAdmin
      .from("universities")
      .select("*, pickupPoints:university_pickup_points(*)")
      .eq("id", inserted.id)
      .single();
    if (reloadError) throw reloadError;

    return NextResponse.json({ success: true, university: withPoints });
  } catch (error) {
    logError("Failed to create university", { error });
    return jsonError(error instanceof Error ? error.message : "Unable to create university");
  }
}

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
  if (!access.authorized) return jsonError(access.error, access.status);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const id = toStringValue(body.id);
    if (!id) return jsonError("id is required", 400);
    if (!canAccessUniversity(access, id)) return jsonError("This university is outside your assignment", 403);

    const name = toStringValue(body.name);
    const shortCode = toStringValue(body.shortCode ?? body.short_code);
    const town = toStringValue(body.town);
    const status = isValidStatus(body.status) ? body.status : undefined;
    const pickupPoints = toPickupPointInputs(body.pickupPoints ?? body.pickup_points);

    const payload: Record<string, unknown> = {};
    if (access.isGlobal) {
      if (name) payload.name = name;
      if (shortCode) payload.short_code = shortCode;
      if (town) payload.town = town;
      if (status) payload.status = status;
    }

    if (Object.keys(payload).length > 0) {
      const { error: updateError } = await supabaseAdmin.from("universities").update(payload).eq("id", id);
      if (updateError) throw updateError;
    }

    if (pickupPoints.length > 0) {
      await upsertPickupPoints(id, pickupPoints);
    }

    const { data: updated, error: reloadError } = await supabaseAdmin
      .from("universities")
      .select("*, pickupPoints:university_pickup_points(*)")
      .eq("id", id)
      .single();
    if (reloadError) throw reloadError;

    return NextResponse.json({ success: true, university: updated });
  } catch (error) {
    logError("Failed to update university", { error });
    return jsonError(error instanceof Error ? error.message : "Unable to update university");
  }
}
