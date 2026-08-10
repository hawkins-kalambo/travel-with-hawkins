import { authFetch } from "@/lib/auth";
import type { JourneyDirection } from "@/lib/journeyDirection";

export async function loadBusinessSettings() {
  const res = await fetch("/api/settings", { credentials: "same-origin" });
  if (!res.ok) {
    throw new Error(`Unable to load settings (${res.status})`);
  }
  const data = (await res.json()) as { settings?: Record<string, unknown> };
  return data.settings || {};
}

export async function saveBusinessSettings(payload: Record<string, unknown>) {
  const res = await authFetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as { success?: boolean; settings?: Record<string, unknown>; error?: string };
  if (!res.ok || data.success !== true) {
    throw new Error(data.error || `Unable to save settings (${res.status})`);
  }

  return data.settings || {};
}

export type PickupPoint = { id: string; label: string; status: string };
export type DistrictPickupPoint = { id: string; university_id: string; district: string; label: string; status: string };
export type University = {
  id: string;
  name: string;
  short_code: string;
  town: string;
  status: string;
  pickupPoints: PickupPoint[];
};

export async function loadUniversities(): Promise<University[]> {
  const res = await authFetch("/api/universities?scope=managed");
  const data = (await res.json()) as { success?: boolean; universities?: University[]; error?: string };
  if (!res.ok || data.success !== true) {
    throw new Error(data.error || `Unable to load universities (${res.status})`);
  }
  return data.universities || [];
}

export async function createUniversity(payload: Record<string, unknown>): Promise<University> {
  const res = await authFetch("/api/universities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { success?: boolean; university?: University; error?: string };
  if (!res.ok || data.success !== true || !data.university) {
    throw new Error(data.error || `Unable to create university (${res.status})`);
  }
  return data.university;
}

export async function updateUniversity(payload: Record<string, unknown>): Promise<University> {
  const res = await authFetch("/api/universities", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { success?: boolean; university?: University; error?: string };
  if (!res.ok || data.success !== true || !data.university) {
    throw new Error(data.error || `Unable to update university (${res.status})`);
  }
  return data.university;
}

export type StructuredRoute = {
  id: string;
  origin_district: string;
  university_id: string;
  pickup_point_id: string | null;
  district_pickup_point_id: string | null;
  fare: number;
  status: string;
  estimated_travel_time: string | null;
  capacity: number | null;
  commission_amount: number;
  commission_type: "fixed" | "percentage";
  direction: JourneyDirection;
  university?: { id: string; name: string; short_code: string; status: string };
  pickupPoint?: { id: string; label: string; status: string } | null;
  districtPickupPoint?: { id: string; district: string; label: string; status: string } | null;
};

export async function loadDistrictPickupPoints(): Promise<DistrictPickupPoint[]> {
  const res = await authFetch("/api/district-pickup-points");
  const data = (await res.json()) as { success?: boolean; pickupPoints?: DistrictPickupPoint[]; error?: string };
  if (!res.ok || data.success !== true) throw new Error(data.error || `Unable to load district pickup points (${res.status})`);
  return data.pickupPoints || [];
}

export async function createDistrictPickupPoint(payload: Record<string, unknown>): Promise<DistrictPickupPoint> {
  const res = await authFetch("/api/district-pickup-points", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { success?: boolean; pickupPoint?: DistrictPickupPoint; error?: string };
  if (!res.ok || data.success !== true || !data.pickupPoint) throw new Error(data.error || `Unable to create district pickup point (${res.status})`);
  return data.pickupPoint;
}

export async function updateDistrictPickupPoint(payload: Record<string, unknown>): Promise<DistrictPickupPoint> {
  const res = await authFetch("/api/district-pickup-points", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { success?: boolean; pickupPoint?: DistrictPickupPoint; error?: string };
  if (!res.ok || data.success !== true || !data.pickupPoint) throw new Error(data.error || `Unable to update district pickup point (${res.status})`);
  return data.pickupPoint;
}

export async function loadRoutes(): Promise<StructuredRoute[]> {
  const res = await authFetch("/api/routes");
  const data = (await res.json()) as { success?: boolean; routes?: StructuredRoute[]; error?: string };
  if (!res.ok || data.success !== true) {
    throw new Error(data.error || `Unable to load routes (${res.status})`);
  }
  return data.routes || [];
}

export async function createRoute(payload: Record<string, unknown>): Promise<StructuredRoute> {
  const res = await authFetch("/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { success?: boolean; route?: StructuredRoute; error?: string };
  if (!res.ok || data.success !== true || !data.route) {
    throw new Error(data.error || `Unable to create route (${res.status})`);
  }
  return data.route;
}

export async function updateRoute(payload: Record<string, unknown>): Promise<StructuredRoute> {
  const res = await authFetch("/api/routes", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { success?: boolean; route?: StructuredRoute; error?: string };
  if (!res.ok || data.success !== true || !data.route) {
    throw new Error(data.error || `Unable to update route (${res.status})`);
  }
  return data.route;
}

export async function deleteRoute(id: string): Promise<void> {
  const res = await authFetch("/api/routes", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const data = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || data.success !== true) {
    throw new Error(data.error || `Unable to delete route (${res.status})`);
  }
}
