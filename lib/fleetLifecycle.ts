// Status transition rules for vehicles and drivers (Master Plan §4.3).
// Two separate transition tables per entity, not one — WHO is making the
// change matters, not just whether the transition is conceptually valid.
// The compliance gate (pending -> active/verified) is always admin-only,
// mirroring how operator application approval works; operators can only
// toggle between states they've already earned (active/maintenance,
// verified/inactive) or retire/stand down what they own.

export type VehicleStatus = "pending" | "active" | "maintenance" | "expired_documents" | "suspended" | "retired";
export type DriverStatus = "pending" | "verified" | "inactive" | "expired_licence" | "suspended";

const VEHICLE_STATUSES: VehicleStatus[] = ["pending", "active", "maintenance", "expired_documents", "suspended", "retired"];
const DRIVER_STATUSES: DriverStatus[] = ["pending", "verified", "inactive", "expired_licence", "suspended"];

const VEHICLE_OPERATOR_TRANSITIONS: Record<VehicleStatus, VehicleStatus[]> = {
  pending: ["retired"],
  active: ["maintenance", "retired"],
  maintenance: ["active", "retired"],
  expired_documents: ["retired"],
  suspended: [],
  retired: [],
};

const VEHICLE_ADMIN_TRANSITIONS: Record<VehicleStatus, VehicleStatus[]> = {
  pending: ["active", "suspended"],
  active: ["maintenance", "expired_documents", "suspended", "retired"],
  maintenance: ["active", "suspended", "retired"],
  expired_documents: ["active", "suspended", "retired"],
  suspended: ["active", "retired"],
  retired: [],
};

const DRIVER_OPERATOR_TRANSITIONS: Record<DriverStatus, DriverStatus[]> = {
  pending: [],
  verified: ["inactive"],
  inactive: ["verified"],
  expired_licence: [],
  suspended: [],
};

const DRIVER_ADMIN_TRANSITIONS: Record<DriverStatus, DriverStatus[]> = {
  pending: ["verified", "suspended"],
  verified: ["inactive", "expired_licence", "suspended"],
  inactive: ["verified", "suspended"],
  expired_licence: ["verified", "suspended"],
  suspended: ["verified"],
};

export function parseVehicleStatus(value: unknown): VehicleStatus | null {
  return typeof value === "string" && (VEHICLE_STATUSES as string[]).includes(value) ? (value as VehicleStatus) : null;
}

export function parseDriverStatus(value: unknown): DriverStatus | null {
  return typeof value === "string" && (DRIVER_STATUSES as string[]).includes(value) ? (value as DriverStatus) : null;
}

export function canOperatorTransitionVehicle(current: VehicleStatus, next: VehicleStatus): boolean {
  return VEHICLE_OPERATOR_TRANSITIONS[current].includes(next);
}

export function canAdminTransitionVehicle(current: VehicleStatus, next: VehicleStatus): boolean {
  return VEHICLE_ADMIN_TRANSITIONS[current].includes(next);
}

export function canOperatorTransitionDriver(current: DriverStatus, next: DriverStatus): boolean {
  return DRIVER_OPERATOR_TRANSITIONS[current].includes(next);
}

export function canAdminTransitionDriver(current: DriverStatus, next: DriverStatus): boolean {
  return DRIVER_ADMIN_TRANSITIONS[current].includes(next);
}
