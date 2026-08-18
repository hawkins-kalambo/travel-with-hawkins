import { normalizeAppRole, type AppRole } from "@/lib/permissions";

export type AdminRole = AppRole;

export function normalizeAdminRole(role: unknown): AdminRole {
  return normalizeAppRole(role);
}

export function isSuperAdminRole(role: unknown): boolean {
  return normalizeAdminRole(role) === "super_admin";
}

export function isViewerRole(role: unknown): boolean {
  return normalizeAdminRole(role) === "viewer";
}
