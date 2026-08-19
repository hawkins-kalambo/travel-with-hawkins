import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logError } from "@/lib/logger";

export const INCIDENT_SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITY_VALUES)[number];

export const INCIDENT_STATUS_VALUES = ["open", "acknowledged", "investigating", "resolved", "closed"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUS_VALUES)[number];

export const INCIDENT_SCOPE_TYPE_VALUES = ["marketplace", "service_type", "operator", "route", "departure", "listing", "booking", "other"] as const;
export type IncidentScopeType = (typeof INCIDENT_SCOPE_TYPE_VALUES)[number];

export function isIncidentSeverity(value: unknown): value is IncidentSeverity {
  return typeof value === "string" && (INCIDENT_SEVERITY_VALUES as readonly string[]).includes(value);
}

export function isIncidentStatus(value: unknown): value is IncidentStatus {
  return typeof value === "string" && (INCIDENT_STATUS_VALUES as readonly string[]).includes(value);
}

export function isIncidentScopeType(value: unknown): value is IncidentScopeType {
  return typeof value === "string" && (INCIDENT_SCOPE_TYPE_VALUES as readonly string[]).includes(value);
}

// INC-YYYYMMDD-XXXX, mirroring generateBookingId()'s date-plus-random
// convention (lib/bookingUtils.ts) rather than a bare sequence, so case
// numbers stay human-scannable without needing a DB sequence.
export function generateIncidentCaseNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INC-${datePart}-${randomPart}`;
}

// Mirrors writeOperatorAudit() in app/api/admin/operators/route.ts — same
// shape every other admin mutation already writes to audit_logs, just for
// entity_type "incident" instead of "operator"/"booking".
export async function writeIncidentAudit(args: {
  request: NextRequest;
  actorUserId: string;
  actorRole: string;
  action: string;
  incidentId: string;
  operatorId?: string | null;
  previousValue: unknown;
  newValue: unknown;
}) {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    actor_user_id: args.actorUserId,
    actor_role: args.actorRole,
    action: args.action,
    entity_type: "incident",
    entity_id: args.incidentId,
    operator_id: args.operatorId ?? null,
    previous_value: args.previousValue,
    new_value: args.newValue,
    ip_address: args.request.headers.get("x-real-ip"),
    user_agent: args.request.headers.get("user-agent"),
  });

  if (error) logError("Failed to write incident audit log", { error: error.message });
}
