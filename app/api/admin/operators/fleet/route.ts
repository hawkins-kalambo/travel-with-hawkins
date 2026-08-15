import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  canAdminTransitionDriver,
  canAdminTransitionVehicle,
  parseDriverStatus,
  parseVehicleStatus,
  type DriverStatus,
  type VehicleStatus,
} from "@/lib/fleetLifecycle";

type EntityType = "vehicle" | "driver";

async function writeFleetAudit(args: {
  request: NextRequest;
  actorUserId: string;
  actorRole: string;
  entityType: EntityType;
  entityId: string;
  operatorId: string;
  previousValue: unknown;
  newValue: unknown;
}) {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: args.actorUserId,
    actor_role: args.actorRole,
    action: `update_${args.entityType}_status`,
    entity_type: args.entityType,
    entity_id: args.entityId,
    operator_id: args.operatorId,
    previous_value: args.previousValue,
    new_value: args.newValue,
    ip_address: args.request.headers.get("x-real-ip"),
    user_agent: args.request.headers.get("user-agent"),
  });
  if (error) console.error("Failed to write fleet audit log", error);
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, NextResponse.next());
  if (!auth.authorized || !auth.user) return jsonError(auth.error ?? "Admin access required", 403);

  const operatorId = new URL(request.url).searchParams.get("operatorId");
  if (!operatorId) return jsonError("operatorId is required", 400);

  const [{ data: vehicles, error: vehiclesError }, { data: drivers, error: driversError }] = await Promise.all([
    supabaseAdmin
      .from("vehicles")
      .select("id, service_type, registration_number, make, model, capacity, status, created_at")
      .eq("operator_id", operatorId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("drivers")
      .select("id, full_name, phone, license_number, status, created_at")
      .eq("operator_id", operatorId)
      .order("created_at", { ascending: false }),
  ]);

  if (vehiclesError || driversError) return jsonError("Unable to load fleet", 500);

  return NextResponse.json({ success: true, vehicles: vehicles ?? [], drivers: drivers ?? [] });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminUser(request, NextResponse.next());
  if (!auth.authorized || !auth.user) return jsonError(auth.error ?? "Admin access required", 403);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const entityType = typeof body.entityType === "string" ? (body.entityType as EntityType) : undefined;
  const entityId = typeof body.entityId === "string" ? body.entityId.trim() : "";
  const requestedStatus = body.status;

  if (entityType !== "vehicle" && entityType !== "driver") return jsonError("entityType must be 'vehicle' or 'driver'", 400);
  if (!entityId) return jsonError("entityId is required", 400);

  const table = entityType === "vehicle" ? "vehicles" : "drivers";
  const { data: existing, error: lookupError } = await supabaseAdmin.from(table).select("*").eq("id", entityId).maybeSingle();
  if (lookupError) return jsonError(`Unable to load ${entityType}`, 500);
  if (!existing) return jsonError(`${entityType === "vehicle" ? "Vehicle" : "Driver"} not found`, 404);

  let nextStatus: VehicleStatus | DriverStatus | null;
  let transitionAllowed: boolean;

  if (entityType === "vehicle") {
    const current = parseVehicleStatus(existing.status);
    nextStatus = parseVehicleStatus(requestedStatus);
    transitionAllowed = Boolean(current && nextStatus && canAdminTransitionVehicle(current, nextStatus));
  } else {
    const current = parseDriverStatus(existing.status);
    nextStatus = parseDriverStatus(requestedStatus);
    transitionAllowed = Boolean(current && nextStatus && canAdminTransitionDriver(current, nextStatus));
  }

  if (!nextStatus) return jsonError("Unsupported status", 400);
  if (!transitionAllowed) return jsonError(`Cannot move this ${entityType} from ${existing.status} to ${nextStatus}`, 409);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from(table)
    .update({ status: nextStatus })
    .eq("id", entityId)
    .select()
    .maybeSingle();

  if (updateError || !updated) return jsonError(`Unable to update ${entityType}`, 500);

  await writeFleetAudit({
    request,
    actorUserId: auth.user.id,
    actorRole: auth.role ?? "admin",
    entityType,
    entityId,
    operatorId: existing.operator_id,
    previousValue: existing,
    newValue: updated,
  });

  return NextResponse.json({ success: true, [entityType]: updated });
}
