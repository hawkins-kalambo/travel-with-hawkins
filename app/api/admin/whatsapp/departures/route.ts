import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { jsonError } from "@/lib/apiResponse";
import { requireWhatsAppAdmin } from "@/lib/whatsapp/admin";

const STATUSES = new Set(["draft", "published", "closed", "cancelled", "completed"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function fields(body: Record<string, unknown>) {
  const routeId = typeof body.routeId === "string" ? body.routeId.trim() : "";
  const travelDate = typeof body.travelDate === "string" ? body.travelDate.trim() : "";
  const departureTime = typeof body.departureTime === "string" && body.departureTime.trim() ? body.departureTime.trim() : null;
  const capacity = Number(body.capacity);
  const status = typeof body.status === "string" && STATUSES.has(body.status) ? body.status : "draft";
  return { routeId, travelDate, departureTime, capacity, status };
}

export async function GET(req: NextRequest) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const result = await supabaseAdmin.from("route_departures").select(
    "*,route:routes(id,origin_district,fare,status,university:universities(name))"
  ).order("travel_date", { ascending: true }).limit(200);
  if (result.error) return jsonError("Unable to load departures", 500);
  return NextResponse.json({ success: true, departures: result.data ?? [] });
}

export async function POST(req: NextRequest) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const value = fields(body);
  if (!value.routeId || !DATE.test(value.travelDate) || value.travelDate < new Date().toISOString().slice(0, 10)) return jsonError("A valid route and future travel date are required", 400);
  if (value.departureTime && !TIME.test(value.departureTime)) return jsonError("departureTime must be HH:MM", 400);
  if (!Number.isInteger(value.capacity) || value.capacity < 1 || value.capacity > 500) return jsonError("capacity must be from 1 to 500", 400);
  const route = await supabaseAdmin.from("routes").select("id,status,fare").eq("id", value.routeId).maybeSingle();
  if (!route.data || route.data.status !== "active" || Number(route.data.fare) <= 0) return jsonError("Only active routes with a configured fare can be scheduled", 400);
  const result = await supabaseAdmin.from("route_departures").insert({
    route_id: value.routeId, travel_date: value.travelDate, departure_time: value.departureTime,
    capacity: value.capacity, status: value.status, created_by: access.user.id,
  }).select().single();
  if (result.error) return jsonError(result.error.code === "23505" ? "That departure already exists" : "Unable to create departure", result.error.code === "23505" ? 409 : 500);
  return NextResponse.json({ success: true, departure: result.data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const access = await requireWhatsAppAdmin(req);
  if (!access.authorized) return jsonError(access.error, access.status);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return jsonError("id is required", 400);
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.status === "string") {
    if (!STATUSES.has(body.status)) return jsonError("Invalid status", 400);
    payload.status = body.status;
  }
  if (body.capacity !== undefined) {
    const capacity = Number(body.capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) return jsonError("capacity must be from 1 to 500", 400);
    payload.capacity = capacity;
  }
  const result = await supabaseAdmin.from("route_departures").update(payload).eq("id", id).select().maybeSingle();
  if (result.error || !result.data) return jsonError("Departure not found", 404);
  return NextResponse.json({ success: true, departure: result.data });
}
