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

export type RouteType = "student" | "general" | "both";
export type RouteDirection = JourneyDirection | "general";

export type StructuredRoute = {
  id: string;
  origin_district: string;
  university_id: string | null;
  destination_district: string | null;
  route_type: RouteType;
  is_popular: boolean;
  popular_order: number | null;
  pickup_point_id: string | null;
  district_pickup_point_id: string | null;
  fare: number;
  status: string;
  estimated_travel_time: string | null;
  capacity: number | null;
  commission_amount: number;
  commission_type: "fixed" | "percentage";
  direction: RouteDirection;
  university?: { id: string; name: string; short_code: string; status: string } | null;
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

export type RouteRequestStatus = "new" | "reviewing" | "added" | "declined";

export type RouteRequest = {
  id: string;
  source: "whatsapp" | "web" | "admin";
  origin: string;
  destination: string;
  traveller_type: "student" | "general" | null;
  travel_date: string | null;
  requested_by_name: string | null;
  requested_by_phone: string | null;
  note: string | null;
  status: RouteRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function loadRouteRequests(status?: RouteRequestStatus): Promise<RouteRequest[]> {
  const res = await authFetch(`/api/route-requests${status ? `?status=${status}` : ""}`);
  const data = (await res.json()) as { success?: boolean; requests?: RouteRequest[]; error?: string };
  if (!res.ok || data.success !== true) {
    throw new Error(data.error || `Unable to load route requests (${res.status})`);
  }
  return data.requests || [];
}

export async function updateRouteRequest(payload: { id: string; status: RouteRequestStatus }): Promise<RouteRequest> {
  const res = await authFetch("/api/route-requests", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { success?: boolean; request?: RouteRequest; error?: string };
  if (!res.ok || data.success !== true || !data.request) {
    throw new Error(data.error || `Unable to update route request (${res.status})`);
  }
  return data.request;
}

export type AiKnowledgeCategory =
  | "general" | "faq" | "booking" | "booking_fee" | "payment" | "cancellation" | "luggage"
  | "pickup" | "business_info" | "contact" | "student_travel" | "university_travel" | "support";

export type AiKnowledgeEntry = {
  id: string;
  topic: string;
  category: AiKnowledgeCategory;
  example_questions: string;
  approved_answer: string;
  language: "en" | "ny";
  keywords: string;
  is_active: boolean;
  priority: number;
  requires_live_data: boolean;
  requires_review: boolean;
  version: number;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function loadAiKnowledge(status?: "active" | "inactive" | "review"): Promise<AiKnowledgeEntry[]> {
  const res = await authFetch(`/api/admin/ai-knowledge${status ? `?status=${status}` : ""}`);
  const data = (await res.json()) as { success?: boolean; entries?: AiKnowledgeEntry[]; error?: string };
  if (!res.ok || data.success !== true) throw new Error(data.error || `Unable to load AI knowledge (${res.status})`);
  return data.entries || [];
}

export async function createAiKnowledge(payload: Record<string, unknown>): Promise<AiKnowledgeEntry> {
  const res = await authFetch("/api/admin/ai-knowledge", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { success?: boolean; entry?: AiKnowledgeEntry; error?: string };
  if (!res.ok || data.success !== true || !data.entry) throw new Error(data.error || `Unable to create AI knowledge (${res.status})`);
  return data.entry;
}

export async function updateAiKnowledge(payload: Record<string, unknown> & { id: string }): Promise<AiKnowledgeEntry> {
  const res = await authFetch("/api/admin/ai-knowledge", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const data = (await res.json()) as { success?: boolean; entry?: AiKnowledgeEntry; error?: string };
  if (!res.ok || data.success !== true || !data.entry) throw new Error(data.error || `Unable to update AI knowledge (${res.status})`);
  return data.entry;
}

export async function deleteAiKnowledge(id: string): Promise<void> {
  const res = await authFetch("/api/admin/ai-knowledge", {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
  });
  const data = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || data.success !== true) throw new Error(data.error || `Unable to delete AI knowledge (${res.status})`);
}

export type AiInteraction = {
  id: string;
  customer_message: string | null;
  detected_language: string | null;
  detected_intent: string | null;
  confidence: number | null;
  requested_tool: string | null;
  allowed_tool: string | null;
  tool_outcome: string;
  fallback_used: boolean;
  clarification_requested: boolean;
  human_requested: boolean;
  urgency: string;
  response_preview: string | null;
  response_ms: number | null;
  model: string | null;
  feedback: string | null;
  created_at: string;
};

export type AiQualitySummary = {
  windowDays: number; turns: number; fallbackRate: number; unknownIntentRate: number;
  clarificationRate: number; humanHandoverRate: number; toolDenied: number; urgent: number;
  byLanguage: Record<string, number>; topIntents: { intent: string; count: number }[];
  avgResponseMs: number | null; feedbackHelpful: number; feedbackNeedsHelp: number;
};

export async function loadAiSummary(days = 30): Promise<{ summary: AiQualitySummary; features: Record<string, boolean> }> {
  const res = await authFetch(`/api/admin/ai-interactions?summary=1&days=${days}`);
  const data = (await res.json()) as { success?: boolean; summary?: AiQualitySummary; features?: Record<string, boolean>; error?: string };
  if (!res.ok || data.success !== true || !data.summary) throw new Error(data.error || `Unable to load AI summary (${res.status})`);
  return { summary: data.summary, features: data.features ?? {} };
}

export async function loadAiInteractions(params: { fallback?: boolean; unreviewed?: boolean; intent?: string } = {}): Promise<AiInteraction[]> {
  const qs = new URLSearchParams();
  if (params.fallback) qs.set("fallback", "1");
  if (params.unreviewed) qs.set("unreviewed", "1");
  if (params.intent) qs.set("intent", params.intent);
  const res = await authFetch(`/api/admin/ai-interactions${qs.toString() ? `?${qs}` : ""}`);
  const data = (await res.json()) as { success?: boolean; interactions?: AiInteraction[]; error?: string };
  if (!res.ok || data.success !== true) throw new Error(data.error || `Unable to load AI interactions (${res.status})`);
  return data.interactions || [];
}

export async function reviewAiInteraction(id: string, feedback: "correct" | "needs_improvement" | "unsafe"): Promise<AiInteraction> {
  const res = await authFetch("/api/admin/ai-interactions", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, feedback }),
  });
  const data = (await res.json()) as { success?: boolean; interaction?: AiInteraction; error?: string };
  if (!res.ok || data.success !== true || !data.interaction) throw new Error(data.error || `Unable to review (${res.status})`);
  return data.interaction;
}
