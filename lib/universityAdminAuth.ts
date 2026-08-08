import "server-only";

import type { NextRequest, NextResponse } from "next/server";
import { normalizeAppRole, type AppRole } from "@/lib/permissions";
import { requireAuthenticatedUser, resolveAdminRole } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type UniversityOperationsPermission =
  | "viewBookings"
  | "manageBookings"
  | "viewReports"
  | "confirmCash"
  | "viewAmbassadors"
  | "viewApplications"
  | "viewReferrals"
  | "viewCommissions"
  | "manageRoutes";

type AssignmentRow = {
  university_id: string;
  can_manage_bookings: boolean | null;
  can_view_reports: boolean | null;
  can_confirm_cash: boolean | null;
  can_view_ambassadors: boolean | null;
  can_view_applications: boolean | null;
  can_view_referrals: boolean | null;
  can_view_commissions: boolean | null;
  can_manage_routes: boolean | null;
};

export type UniversityOperationsContext = {
  authorized: true;
  user: { id: string; email?: string | null };
  role: AppRole;
  isGlobal: boolean;
  universityIds: string[];
};

export type UniversityOperationsFailure = {
  authorized: false;
  user: null;
  role: AppRole;
  isGlobal: false;
  universityIds: [];
  error: string;
  status: 401 | 403;
};

function assignmentAllows(row: AssignmentRow, permission: UniversityOperationsPermission): boolean {
  if (permission === "manageBookings") return row.can_manage_bookings === true;
  if (permission === "viewReports") return row.can_view_reports === true;
  if (permission === "confirmCash") return row.can_confirm_cash === true;
  if (permission === "viewAmbassadors") return row.can_view_ambassadors === true;
  if (permission === "viewApplications") return row.can_view_applications === true;
  if (permission === "viewReferrals") return row.can_view_referrals === true;
  if (permission === "viewCommissions") return row.can_view_commissions === true;
  if (permission === "manageRoutes") return row.can_manage_routes === true;
  return true;
}

export async function requireUniversityOperationsUser(
  request: NextRequest,
  response: NextResponse,
  permission: UniversityOperationsPermission
): Promise<UniversityOperationsContext | UniversityOperationsFailure> {
  const auth = await requireAuthenticatedUser(request, response);
  if (auth.error || !auth.user) {
    return {
      authorized: false,
      user: null,
      role: "unknown",
      isGlobal: false,
      universityIds: [],
      error: "Authentication required",
      status: 401,
    };
  }

  const role = normalizeAppRole(await resolveAdminRole(auth.user));

  if (role === "super_admin" || role === "admin") {
    return { authorized: true, user: auth.user, role, isGlobal: true, universityIds: [] };
  }

  if (role === "viewer" && (permission === "viewBookings" || permission === "viewReports")) {
    return { authorized: true, user: auth.user, role, isGlobal: true, universityIds: [] };
  }

  if (role !== "university_admin") {
    return {
      authorized: false,
      user: null,
      role,
      isGlobal: false,
      universityIds: [],
      error: "University operations access required",
      status: 403,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("university_admin_assignments")
    .select("university_id, can_manage_bookings, can_view_reports, can_confirm_cash, can_view_ambassadors, can_view_applications, can_view_referrals, can_view_commissions, can_manage_routes")
    .eq("user_id", auth.user.id)
    .eq("status", "active");

  if (error) {
    console.error("Failed to resolve university admin assignments", { userId: auth.user.id, error: error.message });
    return {
      authorized: false,
      user: null,
      role,
      isGlobal: false,
      universityIds: [],
      error: "Unable to verify university assignment",
      status: 403,
    };
  }

  const universityIds = ((data as AssignmentRow[] | null) ?? [])
    .filter((row) => assignmentAllows(row, permission))
    .map((row) => row.university_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (universityIds.length === 0) {
    return {
      authorized: false,
      user: null,
      role,
      isGlobal: false,
      universityIds: [],
      error: "No active university assignment grants this operation",
      status: 403,
    };
  }

  return { authorized: true, user: auth.user, role, isGlobal: false, universityIds };
}

export function canAccessUniversity(
  context: Pick<UniversityOperationsContext, "isGlobal" | "universityIds">,
  universityId: unknown
): boolean {
  if (context.isGlobal) return true;
  return typeof universityId === "string" && context.universityIds.includes(universityId);
}
