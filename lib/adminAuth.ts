export type AdminRole = "super_admin" | "viewer" | "unknown";

export const VIEWER_ALLOWED_TABS = ["overview", "trips", "bookings"] as const;

export function normalizeAdminRole(role: unknown): AdminRole {
  if (typeof role !== "string") return "unknown";
  const normalized = role.trim().toLowerCase();
  if (normalized === "super_admin" || normalized === "admin") return "super_admin";
  if (normalized === "viewer") return "viewer";
  return "unknown";
}

export function isSuperAdminRole(role: unknown): boolean {
  return normalizeAdminRole(role) === "super_admin";
}

export function isViewerRole(role: unknown): boolean {
  return normalizeAdminRole(role) === "viewer";
}

export function isViewerAllowedTab(tab: string): boolean {
  return (VIEWER_ALLOWED_TABS as readonly string[]).includes(tab);
}
