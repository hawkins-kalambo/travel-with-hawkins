import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireAdminUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateIncidentCaseNumber,
  isIncidentScopeType,
  isIncidentSeverity,
  isIncidentStatus,
  writeIncidentAudit,
} from "@/lib/incidents";
import { notifyOperatorOfIncident } from "@/lib/operatorNotifications";

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, NextResponse.next());
  if (!auth.authorized || !auth.user) return jsonError(auth.error ?? "Admin access required", 403);

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");
  const auditIncidentId = url.searchParams.get("auditIncidentId");

  if (auditIncidentId) {
    const { data, error } = await supabaseAdmin
      .from("audit_logs")
      .select("*")
      .eq("entity_type", "incident")
      .eq("entity_id", auditIncidentId)
      .order("created_at", { ascending: true });
    if (error) return jsonError("Unable to load incident audit trail", 500);
    return NextResponse.json({ success: true, auditEvents: data ?? [] });
  }

  let query = supabaseAdmin.from("incidents").select("*").order("created_at", { ascending: false });
  if (statusFilter && isIncidentStatus(statusFilter)) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) return jsonError("Unable to load incidents", 500);

  return NextResponse.json({ success: true, incidents: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, NextResponse.next());
  if (!auth.authorized || !auth.user) return jsonError(auth.error ?? "Admin access required", 403);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const severity = typeof body.severity === "string" ? body.severity : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : null;
  const scopeType = typeof body.scopeType === "string" ? body.scopeType : "";
  const scopeServiceType = typeof body.scopeServiceType === "string" ? body.scopeServiceType : null;
  const operatorId = typeof body.operatorId === "string" && body.operatorId ? body.operatorId : null;
  const routeId = typeof body.routeId === "string" && body.routeId ? body.routeId : null;
  const departureId = typeof body.departureId === "string" && body.departureId ? body.departureId : null;
  const bookingId = typeof body.bookingId === "string" && body.bookingId ? body.bookingId : null;

  if (!isIncidentSeverity(severity)) return jsonError("A valid severity is required", 400);
  if (!title || title.length < 5) return jsonError("A title of at least 5 characters is required", 400);
  if (!isIncidentScopeType(scopeType)) return jsonError("A valid scopeType is required", 400);
  if (scopeServiceType && !["intercity", "taxi", "car_hire"].includes(scopeServiceType)) {
    return jsonError("Unsupported scopeServiceType", 400);
  }
  if (scopeType === "operator" && !operatorId) return jsonError("operatorId is required when scopeType is 'operator'", 400);

  const { data: created, error: insertError } = await supabaseAdmin
    .from("incidents")
    .insert({
      case_number: generateIncidentCaseNumber(),
      severity,
      title,
      description,
      scope_type: scopeType,
      scope_service_type: scopeServiceType,
      operator_id: operatorId,
      route_id: routeId,
      departure_id: departureId,
      booking_id: bookingId,
      reported_by: auth.user.id,
      owner_user_id: auth.user.id,
    })
    .select()
    .maybeSingle();

  if (insertError || !created) return jsonError("Unable to create incident", 500);

  await writeIncidentAudit({
    request,
    actorUserId: auth.user.id,
    actorRole: auth.role ?? "admin",
    action: "create_incident",
    incidentId: created.id,
    operatorId,
    previousValue: null,
    newValue: created,
  });

  if (operatorId) await notifyOperatorOfIncident(operatorId, created);

  return NextResponse.json({ success: true, incident: created });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminUser(request, NextResponse.next());
  if (!auth.authorized || !auth.user) return jsonError(auth.error ?? "Admin access required", 403);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const incidentId = typeof body.incidentId === "string" ? body.incidentId.trim() : "";
  const status = typeof body.status === "string" ? body.status : undefined;
  const resolution = typeof body.resolution === "string" ? body.resolution.trim() : undefined;
  const rootCause = typeof body.rootCause === "string" ? body.rootCause.trim() : undefined;
  const correctiveAction = typeof body.correctiveAction === "string" ? body.correctiveAction.trim() : undefined;
  const customerCommunicationSent = typeof body.customerCommunicationSent === "boolean" ? body.customerCommunicationSent : undefined;

  if (!incidentId) return jsonError("incidentId is required", 400);
  if (status && !isIncidentStatus(status)) return jsonError("Unsupported status", 400);
  if (status === "resolved" && !resolution) return jsonError("A resolution is required to mark an incident resolved", 400);

  const { data: existing, error: lookupError } = await supabaseAdmin.from("incidents").select("*").eq("id", incidentId).maybeSingle();
  if (lookupError) return jsonError("Unable to load incident", 500);
  if (!existing) return jsonError("Incident not found", 404);

  const updatePayload: Record<string, unknown> = {};
  if (status) {
    updatePayload.status = status;
    if (status === "acknowledged" && !existing.acknowledged_at) updatePayload.acknowledged_at = new Date().toISOString();
    if (status === "resolved") updatePayload.resolved_at = new Date().toISOString();
  }
  if (resolution !== undefined) updatePayload.resolution = resolution;
  if (rootCause !== undefined) updatePayload.root_cause = rootCause;
  if (correctiveAction !== undefined) updatePayload.corrective_action = correctiveAction;
  if (customerCommunicationSent !== undefined) updatePayload.customer_communication_sent = customerCommunicationSent;

  if (Object.keys(updatePayload).length === 0) return jsonError("No changes provided", 400);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("incidents")
    .update(updatePayload)
    .eq("id", incidentId)
    .select()
    .maybeSingle();

  if (updateError || !updated) return jsonError("Unable to update incident", 500);

  await writeIncidentAudit({
    request,
    actorUserId: auth.user.id,
    actorRole: auth.role ?? "admin",
    action: "update_incident",
    incidentId,
    operatorId: existing.operator_id,
    previousValue: existing,
    newValue: updated,
  });

  return NextResponse.json({ success: true, incident: updated });
}
