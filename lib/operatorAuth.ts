import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  hasOperatorPermission,
  normalizeOperatorStaffRole,
  type OperatorPermissionKey,
  type OperatorStaffRole,
} from "@/lib/operatorPermissions";

export type OperatorContext = {
  authorized: true;
  user: { id: string; email?: string | null };
  operatorId: string;
  staffRole: OperatorStaffRole;
  operatorStatus: string;
  applicationStatus: string;
};

export type OperatorFailure = {
  authorized: false;
  error: string;
  status: 401 | 403;
};

type MembershipRow = {
  operator_id: string;
  staff_role: string;
  status: string;
  operators: { status: string; application_status: string } | null;
};

// Proxy.ts is only an optimistic gate (role === "operator_staff"). This is
// the definitive check every operator-facing route handler must call: it
// resolves exactly which operator the caller belongs to and whether their
// staff_role grants the specific permission being exercised, mirroring
// requireUniversityOperationsUser in lib/universityAdminAuth.ts.
export async function requireOperatorUser(
  request: NextRequest,
  response: NextResponse,
  permission?: OperatorPermissionKey
): Promise<OperatorContext | OperatorFailure> {
  const auth = await requireAuthenticatedUser(request, response);
  if (auth.error || !auth.user) {
    return { authorized: false, error: "Authentication required", status: 401 };
  }

  const { data, error } = await supabaseAdmin
    .from("operator_memberships")
    .select("operator_id, staff_role, status, operators(status, application_status)")
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to resolve operator membership", { userId: auth.user.id, error: error.message });
    return { authorized: false, error: "Unable to verify operator membership", status: 403 };
  }

  const membership = data as unknown as MembershipRow | null;
  if (!membership) {
    return { authorized: false, error: "Operator access required", status: 403 };
  }

  const staffRole = normalizeOperatorStaffRole(membership.staff_role);
  if (!staffRole) {
    return { authorized: false, error: "Unrecognized staff role", status: 403 };
  }

  if (permission && !hasOperatorPermission(staffRole, permission)) {
    return { authorized: false, error: "This action is not permitted for your role", status: 403 };
  }

  return {
    authorized: true,
    user: auth.user,
    operatorId: membership.operator_id,
    staffRole,
    operatorStatus: membership.operators?.status ?? "draft",
    applicationStatus: membership.operators?.application_status ?? "draft",
  };
}
