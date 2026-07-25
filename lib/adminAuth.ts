import { normalizeAppRole, type AppRole } from "@/lib/permissions";

export type AdminRole = AppRole;

export const VIEWER_ALLOWED_TABS = ["overview", "trips", "bookings"] as const;

export function normalizeAdminRole(role: unknown): AdminRole {
  return normalizeAppRole(role);
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
