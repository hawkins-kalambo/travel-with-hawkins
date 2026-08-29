import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logError } from "@/lib/logger";
import { MALAWI_DISTRICTS } from "@/lib/tripSearchData";
import { isJourneyDirection } from "@/lib/journeyDirection";
import { canAccessUniversity, requireUniversityOperationsUser } from "@/lib/universityAdminAuth";
import { jsonError } from "@/lib/apiResponse";

const ROUTE_SELECT = "*, university:universities(id, name, short_code, status), pickupPoint:university_pickup_points(id, label, status), districtPickupPoint:district_pickup_points(id, district, label, status)";

function isRouteType(value: unknown): value is "student" | "general" | "both" {
  return value === "student" || value === "general" || value === "both";
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

function isGeneralLegConflict(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "23505" && Boolean(error.message?.includes("idx_routes_general_leg"));
}

function isRouteShapeError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "23514"
    && Boolean(error.message?.includes("routes_type_shape_check") || error.message?.includes("routes_direction_check"));
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed);
  }
  return undefined;
}

function isValidStatus(value: unknown): value is "active" | "inactive" {
  return value === "active" || value === "inactive";
}

function isValidCommissionType(value: unknown): value is "fixed" | "percentage" {
  return value === "fixed" || value === "percentage";
}

function isValidDistrict(value: string): value is (typeof MALAWI_DISTRICTS)[number] {
  return (MALAWI_DISTRICTS as readonly string[]).includes(value);
}

function isDuplicateLegError(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "23505" && Boolean(error.message?.includes("routes_unique_leg"));
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const universityId = url.searchParams.get("universityId");
    const originDistrict = url.searchParams.get("originDistrict");
    const status = url.searchParams.get("status");
    const direction = url.searchParams.get("direction");
    const routeType = url.searchParams.get("type");
    const popularOnly = toBoolean(url.searchParams.get("popular"));

    if (direction && !isJourneyDirection(direction) && direction !== "general") {
      return jsonError("direction must be to_university, from_university or general", 400);
    }
    if (routeType && !isRouteType(routeType)) {
      return jsonError("type must be student, general or both", 400);
    }

    let scopedUniversityIds: string[] | null = null;
    if (status !== "active") {
      const response = NextResponse.next();
      const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
      if (!access.authorized) return jsonError(access.error, access.status);
      if (!access.isGlobal) scopedUniversityIds = access.universityIds;
    }

    let query = supabaseAdmin
      .from("routes")
      .select(ROUTE_SELECT)
      .order("origin_district", { ascending: true });

    if (universityId) query = query.eq("university_id", universityId);
    if (originDistrict) query = query.eq("origin_district", originDistrict);
    if (status) query = query.eq("status", status);
    if (direction) query = query.eq("direction", direction);
    if (routeType) query = query.eq("route_type", routeType);
    if (popularOnly) query = query.eq("is_popular", true);
    if (scopedUniversityIds) query = query.in("university_id", scopedUniversityIds);

    const { data, error } = await query;
    if (error) throw error;

    const routes = status === "active"
      ? (data ?? []).filter((route) => {
          const relations = route as unknown as {
            route_type?: string;
            direction?: string;
            university?: { status?: string } | null;
            pickupPoint?: { status?: string } | null;
            districtPickupPoint?: { status?: string } | null;
          };
          // General routes have no university and may have no pickup points —
          // only an attached point that is inactive should hide them.
          if (relations.route_type === "general" || relations.direction === "general") {
            return !relations.districtPickupPoint || relations.districtPickupPoint.status === "active";
          }
          return relations.university?.status === "active"
            && relations.districtPickupPoint?.status === "active"
            && (!relations.pickupPoint || relations.pickupPoint.status === "active");
        })
      : data ?? [];

    return NextResponse.json({ success: true, routes });
  } catch (error) {
    logError("Failed to load routes", { error });
    return jsonError(error instanceof Error ? error.message : "Failed to load routes");
  }
}

export async function POST(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
  if (!access.authorized) return jsonError(access.error, access.status);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const originDistrict = toStringValue(body.originDistrict ?? body.origin_district);
    const universityId = toStringValue(body.universityId ?? body.university_id);
    const pickupPointId = toStringValue(body.pickupPointId ?? body.pickup_point_id) ?? null;
    const districtPickupPointId = toStringValue(body.districtPickupPointId ?? body.district_pickup_point_id);
    const fare = toNonNegativeInteger(body.fare) ?? 0;
    const status = isValidStatus(body.status) ? body.status : "inactive";
    const estimatedTravelTime = toStringValue(body.estimatedTravelTime ?? body.estimated_travel_time) ?? null;
    const capacity = toNonNegativeInteger(body.capacity) ?? null;
    const commissionAmount = toNonNegativeInteger(body.commissionAmount ?? body.commission_amount) ?? 0;
    const rawCommissionType = body.commissionType ?? body.commission_type;
    const commissionType = isValidCommissionType(rawCommissionType) ? rawCommissionType : "fixed";
    const routeType = isRouteType(body.routeType ?? body.route_type) ? (body.routeType ?? body.route_type) as "student" | "general" | "both" : "student";
    const isPopular = toBoolean(body.isPopular ?? body.is_popular) ?? false;
    const popularOrder = toNonNegativeInteger(body.popularOrder ?? body.popular_order) ?? null;

    if (!originDistrict || !isValidDistrict(originDistrict)) {
      return jsonError("originDistrict must be a valid Malawi district", 400);
    }

    // General (district-to-district) route: no university, no university-owned
    // pickup points. A global operations admin only — a scoped university_admin
    // has no assignment that covers a route with no university.
    if (routeType === "general") {
      if (!access.isGlobal) return jsonError("Only a global operations admin can manage general routes", 403);
      const destinationDistrict = toStringValue(body.destinationDistrict ?? body.destination_district);
      if (!destinationDistrict || !isValidDistrict(destinationDistrict)) {
        return jsonError("destinationDistrict must be a valid Malawi district", 400);
      }
      if (destinationDistrict === originDistrict) {
        return jsonError("origin and destination districts must be different", 400);
      }

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("routes")
        .insert([
          {
            origin_district: originDistrict,
            destination_district: destinationDistrict,
            university_id: null,
            pickup_point_id: null,
            district_pickup_point_id: null,
            route_type: "general",
            direction: "general",
            fare,
            status,
            estimated_travel_time: estimatedTravelTime,
            capacity,
            commission_amount: commissionAmount,
            commission_type: commissionType,
            is_popular: isPopular,
            popular_order: popularOrder,
          },
        ])
        .select(ROUTE_SELECT)
        .single();

      if (insertError) {
        if (isGeneralLegConflict(insertError)) {
          return jsonError("A general route already exists for this district pair.", 409);
        }
        if (isRouteShapeError(insertError)) {
          return jsonError("That route shape is not allowed for a general route.", 400);
        }
        throw insertError;
      }
      return NextResponse.json({ success: true, route: inserted });
    }

    const direction = isJourneyDirection(body.direction) ? body.direction : "to_university";

    if (!universityId) return jsonError("universityId is required", 400);
    if (!districtPickupPointId) return jsonError("districtPickupPointId is required", 400);
    if (!canAccessUniversity(access, universityId)) return jsonError("This university is outside your assignment", 403);

    const { data: districtPoint, error: districtPointError } = await supabaseAdmin
      .from("district_pickup_points")
      .select("id, university_id, district, status")
      .eq("id", districtPickupPointId)
      .maybeSingle();
    if (districtPointError) throw districtPointError;
    if (!districtPoint || districtPoint.university_id !== universityId || districtPoint.district !== originDistrict) {
      return jsonError("The district pickup point does not belong to this university and district", 400);
    }

    // A NULL pickup_point_id is only unambiguous when the university has
    // exactly one active site — otherwise the routes_unique_leg constraint
    // can't tell two routes to the same district apart, and neither can a
    // customer. Resolve it here rather than leaving it to chance.
    let resolvedPickupPointId = pickupPointId;
    if (!resolvedPickupPointId) {
      const { data: activePoints, error: pointsError } = await supabaseAdmin
        .from("university_pickup_points")
        .select("id")
        .eq("university_id", universityId)
        .eq("status", "active");
      if (pointsError) throw pointsError;

      if ((activePoints ?? []).length > 1) {
        return jsonError("This university has more than one active pickup point — pickupPointId is required.", 400);
      }
      if ((activePoints ?? []).length === 1) {
        resolvedPickupPointId = activePoints![0].id;
      }
    }
    if (resolvedPickupPointId) {
      const { data: campusPoint, error: campusPointError } = await supabaseAdmin
        .from("university_pickup_points")
        .select("university_id")
        .eq("id", resolvedPickupPointId)
        .maybeSingle();
      if (campusPointError) throw campusPointError;
      if (!campusPoint || campusPoint.university_id !== universityId) {
        return jsonError("The campus point does not belong to this university", 400);
      }
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("routes")
      .insert([
        {
          origin_district: originDistrict,
          university_id: universityId,
          pickup_point_id: resolvedPickupPointId,
          district_pickup_point_id: districtPickupPointId,
          fare,
          status,
          estimated_travel_time: estimatedTravelTime,
          capacity,
          commission_amount: commissionAmount,
          commission_type: commissionType,
          direction,
          route_type: routeType === "both" ? "both" : "student",
          is_popular: isPopular,
          popular_order: popularOrder,
        },
      ])
      .select(ROUTE_SELECT)
      .single();

    if (insertError) {
      if (isDuplicateLegError(insertError)) {
        return jsonError("A route already exists for this district, university, pickup point and direction.", 409);
      }
      if (isRouteShapeError(insertError)) {
        return jsonError("That route type does not match its university and direction.", 400);
      }
      throw insertError;
    }

    return NextResponse.json({ success: true, route: inserted });
  } catch (error) {
    logError("Failed to create route", { error });
    return jsonError(error instanceof Error ? error.message : "Unable to create route");
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
    const { data: currentRoute, error: currentError } = await supabaseAdmin
      .from("routes")
      .select("id, university_id, origin_district")
      .eq("id", id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!currentRoute) return jsonError("Route not found", 404);
    if (!canAccessUniversity(access, currentRoute.university_id)) return jsonError("This route is outside your assignment", 403);

    const originDistrict = toStringValue(body.originDistrict ?? body.origin_district);
    const pickupPointId = toStringValue(body.pickupPointId ?? body.pickup_point_id);
    const districtPickupPointId = toStringValue(body.districtPickupPointId ?? body.district_pickup_point_id);
    const fare = toNonNegativeInteger(body.fare);
    const status = isValidStatus(body.status) ? body.status : undefined;
    const estimatedTravelTime = toStringValue(body.estimatedTravelTime ?? body.estimated_travel_time);
    const capacity = toNonNegativeInteger(body.capacity);
    const commissionAmount = toNonNegativeInteger(body.commissionAmount ?? body.commission_amount);
    const rawCommissionType = body.commissionType ?? body.commission_type;
    const commissionType = isValidCommissionType(rawCommissionType) ? rawCommissionType : undefined;
    const direction = isJourneyDirection(body.direction) || body.direction === "general" ? body.direction as string : undefined;
    const routeType = isRouteType(body.routeType ?? body.route_type) ? (body.routeType ?? body.route_type) as string : undefined;
    const isPopular = toBoolean(body.isPopular ?? body.is_popular);
    const popularOrderProvided = "popularOrder" in body || "popular_order" in body;
    const popularOrderRaw = "popularOrder" in body ? body.popularOrder : body.popular_order;
    const popularOrder = popularOrderRaw === null || popularOrderRaw === ""
      ? null
      : toNonNegativeInteger(popularOrderRaw) ?? null;
    const destinationDistrict = toStringValue(body.destinationDistrict ?? body.destination_district);

    if (originDistrict !== undefined && !isValidDistrict(originDistrict)) {
      return jsonError("originDistrict must be a valid Malawi district", 400);
    }
    if (destinationDistrict !== undefined && !isValidDistrict(destinationDistrict)) {
      return jsonError("destinationDistrict must be a valid Malawi district", 400);
    }

    if (districtPickupPointId) {
      const { data: districtPoint, error: districtPointError } = await supabaseAdmin
        .from("district_pickup_points")
        .select("university_id, district")
        .eq("id", districtPickupPointId)
        .maybeSingle();
      if (districtPointError) throw districtPointError;
      const effectiveDistrict = originDistrict ?? currentRoute.origin_district;
      if (!districtPoint || districtPoint.university_id !== currentRoute.university_id || districtPoint.district !== effectiveDistrict) {
        return jsonError("The district pickup point does not belong to this route's university and district", 400);
      }
    }
    if (pickupPointId) {
      const { data: campusPoint, error: campusPointError } = await supabaseAdmin
        .from("university_pickup_points")
        .select("university_id")
        .eq("id", pickupPointId)
        .maybeSingle();
      if (campusPointError) throw campusPointError;
      if (!campusPoint || campusPoint.university_id !== currentRoute.university_id) {
        return jsonError("The campus point does not belong to this route's university", 400);
      }
    }

    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (originDistrict) payload.origin_district = originDistrict;
    if (pickupPointId !== undefined) payload.pickup_point_id = pickupPointId;
    if (districtPickupPointId !== undefined) payload.district_pickup_point_id = districtPickupPointId;
    if (fare !== undefined) payload.fare = fare;
    if (status) payload.status = status;
    if (estimatedTravelTime !== undefined) payload.estimated_travel_time = estimatedTravelTime;
    if (capacity !== undefined) payload.capacity = capacity;
    if (commissionAmount !== undefined) payload.commission_amount = commissionAmount;
    if (commissionType) payload.commission_type = commissionType;
    if (direction) payload.direction = direction;
    if (routeType) payload.route_type = routeType;
    if (isPopular !== undefined) payload.is_popular = isPopular;
    if (popularOrderProvided) payload.popular_order = popularOrder;
    if (destinationDistrict !== undefined) payload.destination_district = destinationDistrict;

    if (Object.keys(payload).length === 1) {
      return jsonError("No valid fields provided to update", 400);
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("routes")
      .update(payload)
      .eq("id", id)
      .select(ROUTE_SELECT)
      .single();

    if (updateError) {
      if (isDuplicateLegError(updateError)) {
        return jsonError("A route already exists for this district, university, pickup point and direction.", 409);
      }
      if (isGeneralLegConflict(updateError)) {
        return jsonError("A general route already exists for this district pair.", 409);
      }
      if (isRouteShapeError(updateError)) {
        return jsonError("That change conflicts with the route's type, university or direction.", 400);
      }
      throw updateError;
    }

    return NextResponse.json({ success: true, route: updated });
  } catch (error) {
    logError("Failed to update route", { error });
    return jsonError(error instanceof Error ? error.message : "Unable to update route");
  }
}

export async function DELETE(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
  if (!access.authorized) return jsonError(access.error, access.status);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const id = toStringValue(body.id);
    if (!id) return jsonError("id is required", 400);

    const { data: currentRoute, error: currentError } = await supabaseAdmin
      .from("routes")
      .select("university_id")
      .eq("id", id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!currentRoute) return jsonError("Route not found", 404);
    if (!canAccessUniversity(access, currentRoute.university_id)) return jsonError("This route is outside your assignment", 403);

    const { error: deleteError } = await supabaseAdmin.from("routes").delete().eq("id", id);
    if (deleteError) {
      if (deleteError.code === "23503") {
        return jsonError("This route has bookings on record and can't be deleted — set it to inactive instead.", 409);
      }
      throw deleteError;
    }

    return NextResponse.json({ success: true, message: "Route deleted" });
  } catch (error) {
    logError("Failed to delete route", { error });
    return jsonError(error instanceof Error ? error.message : "Unable to delete route");
  }
}
