import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logError } from "@/lib/logger";
import { requireUniversityOperationsUser } from "@/lib/universityAdminAuth";
import { jsonError } from "@/lib/apiResponse";

// Customer-submitted "we don't run this corridor yet" requests (WhatsApp, and
// later web). Reviewed by a global operations admin — the table has no
// university, so a scoped university_admin has nothing to scope to.

const ROUTE_REQUEST_SELECT =
  "id, source, origin, destination, traveller_type, travel_date, requested_by_name, requested_by_phone, note, status, reviewed_by, reviewed_at, created_at, updated_at";

const STATUSES = ["new", "reviewing", "added", "declined"] as const;
type RouteRequestStatus = (typeof STATUSES)[number];

function isStatus(value: unknown): value is RouteRequestStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
  if (!access.authorized) return jsonError(access.error, access.status);
  if (!access.isGlobal) return jsonError("Route requests are reviewed by a global operations admin", 403);

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    if (status && !isStatus(status)) {
      return jsonError("status must be new, reviewing, added or declined", 400);
    }

    let query = supabaseAdmin
      .from("route_requests")
      .select(ROUTE_REQUEST_SELECT)
      .order("created_at", { ascending: false })
      .limit(200);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ success: true, requests: data ?? [] });
  } catch (error) {
    logError("Failed to load route requests", { error });
    return jsonError(error instanceof Error ? error.message : "Failed to load route requests");
  }
}

export async function PATCH(req: NextRequest) {
  const response = NextResponse.next();
  const access = await requireUniversityOperationsUser(req, response, "manageRoutes");
  if (!access.authorized) return jsonError(access.error, access.status);
  if (!access.isGlobal) return jsonError("Route requests are reviewed by a global operations admin", 403);

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const status = body.status;
    if (!id) return jsonError("id is required", 400);
    if (!isStatus(status)) {
      return jsonError("status must be new, reviewing, added or declined", 400);
    }

    const reviewed = status === "added" || status === "declined";
    const { data, error } = await supabaseAdmin
      .from("route_requests")
      .update({
        status,
        reviewed_by: reviewed ? access.user.id : null,
        reviewed_at: reviewed ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .select(ROUTE_REQUEST_SELECT)
      .maybeSingle();

    if (error) throw error;
    if (!data) return jsonError("Route request not found", 404);
    return NextResponse.json({ success: true, request: data });
  } catch (error) {
    logError("Failed to update route request", { error });
    return jsonError(error instanceof Error ? error.message : "Unable to update route request");
  }
}
