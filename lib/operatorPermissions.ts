// Operator staff have distinct named roles that map to fixed permission
// sets (Master Plan §4.4) — unlike university_admin, which is one role with
// variable per-assignment permission booleans. No separate permission
// columns on operator_memberships; permissions are derived from staff_role
// here, the same way lib/permissions.ts derives admin-panel permissions
// from a profiles.role name.

export type OperatorStaffRole = "owner" | "manager" | "dispatcher" | "finance_officer" | "booking_agent" | "driver";

export type OperatorPermissionKey =
  | "viewDashboard"
  | "manageVehicles"
  | "manageDrivers"
  | "manageStaff"
  | "manageRoutes"
  | "manageTrips"
  | "viewBookings"
  | "manageBookings"
  | "manageFinance"
  | "manageDocuments"
  | "viewManifests"
  | "reportIncidents"
  | "manageOwnProfile";

const OPERATOR_ROLE_PERMISSIONS: Record<OperatorStaffRole, OperatorPermissionKey[]> = {
  owner: [
    "viewDashboard",
    "manageVehicles",
    "manageDrivers",
    "manageStaff",
    "manageRoutes",
    "manageTrips",
    "viewBookings",
    "manageBookings",
    "manageFinance",
    "manageDocuments",
    "viewManifests",
    "reportIncidents",
    "manageOwnProfile",
  ],
  manager: [
    "viewDashboard",
    "manageVehicles",
    "manageDrivers",
    "manageStaff",
    "manageRoutes",
    "manageTrips",
    "viewBookings",
    "manageDocuments",
    "viewManifests",
    "reportIncidents",
    "manageOwnProfile",
  ],
  dispatcher: ["viewDashboard", "manageTrips", "viewBookings", "viewManifests", "reportIncidents", "manageOwnProfile"],
  finance_officer: ["viewDashboard", "manageFinance", "manageOwnProfile"],
  booking_agent: ["viewDashboard", "viewBookings", "manageBookings", "manageOwnProfile"],
  driver: ["viewDashboard", "viewManifests", "reportIncidents", "manageOwnProfile"],
};

export function normalizeOperatorStaffRole(role: unknown): OperatorStaffRole | null {
  if (typeof role !== "string") return null;
  const normalized = role.trim().toLowerCase();
  if (normalized in OPERATOR_ROLE_PERMISSIONS) return normalized as OperatorStaffRole;
  return null;
}

export function getOperatorRolePermissions(role: unknown): OperatorPermissionKey[] {
  const normalized = normalizeOperatorStaffRole(role);
  return normalized ? OPERATOR_ROLE_PERMISSIONS[normalized] : [];
}

export function hasOperatorPermission(role: unknown, permission: OperatorPermissionKey): boolean {
  return getOperatorRolePermissions(role).includes(permission);
}
