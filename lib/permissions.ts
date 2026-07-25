export type AppRole = "super_admin" | "admin" | "viewer" | "ambassador" | "customer" | "unknown";

export type PermissionKey =
  | "viewDashboard"
  | "viewReports"
  | "viewBookings"
  | "viewReferrals"
  | "viewAmbassadors"
  | "viewAnalytics"
  | "manageUsers"
  | "manageBookings"
  | "manageTrips"
  | "manageSettings"
  | "manageReports"
  | "manageReferrals"
  | "manageCommissionRates"
  | "approveCommissions"
  | "manageBusinessConfiguration"
  | "manageAmbassadors"
  | "printManifests"
  | "manageStudents"
  | "viewCommissionDashboard"
  | "viewProfile"
  | "bookTrips"
  | "manageOwnBookings"
  | "manageOwnProfile";

const ROLE_PERMISSIONS: Record<AppRole, PermissionKey[]> = {
  super_admin: [
    "viewDashboard",
    "viewReports",
    "viewBookings",
    "viewReferrals",
    "viewAmbassadors",
    "viewAnalytics",
    "manageUsers",
    "manageBookings",
    "manageTrips",
    "manageSettings",
    "manageReports",
    "manageReferrals",
    "manageCommissionRates",
    "approveCommissions",
    "manageBusinessConfiguration",
    "manageAmbassadors",
    "printManifests",
    "manageStudents",
    "viewCommissionDashboard",
    "viewProfile",
    "bookTrips",
    "manageOwnBookings",
    "manageOwnProfile",
  ],
  admin: [
    "viewDashboard",
    "viewReports",
    "viewBookings",
    "viewReferrals",
    "viewAmbassadors",
    "viewAnalytics",
    "manageBookings",
    "manageTrips",
    "manageReports",
    "manageReferrals",
    "manageAmbassadors",
    "printManifests",
    "manageStudents",
    "viewCommissionDashboard",
    "viewProfile",
  ],
  viewer: [
    "viewDashboard",
    "viewReports",
    "viewBookings",
    "viewReferrals",
    "viewAmbassadors",
    "viewAnalytics",
    "viewCommissionDashboard",
    "viewProfile",
    "printManifests",
  ],
  ambassador: [
    "viewDashboard",
    "viewReferrals",
    "viewBookings",
    "viewCommissionDashboard",
    "viewProfile",
    "printManifests",
    "manageOwnBookings",
    "manageOwnProfile",
  ],
  customer: ["viewProfile", "bookTrips", "manageOwnBookings", "manageOwnProfile"],
  unknown: [],
};

export function normalizeAppRole(role: unknown): AppRole {
  if (typeof role !== "string") return "unknown";

  const normalized = role.trim().toLowerCase();
  if (normalized === "super_admin") return "super_admin";
  if (normalized === "admin") return "admin";
  if (normalized === "viewer") return "viewer";
  if (normalized === "ambassador") return "ambassador";
  if (normalized === "customer") return "customer";
  return "unknown";
}

export function getRolePermissions(role: unknown): PermissionKey[] {
  return ROLE_PERMISSIONS[normalizeAppRole(role)] ?? [];
}

export function hasPermission(role: unknown, permission: PermissionKey): boolean {
  return getRolePermissions(role).includes(permission);
}

export function isAdminLikeRole(role: unknown): boolean {
  const normalizedRole = normalizeAppRole(role);
  return normalizedRole === "super_admin" || normalizedRole === "admin" || normalizedRole === "viewer";
}

export function canManageUsers(role: unknown): boolean {
  return hasPermission(role, "manageUsers");
}
