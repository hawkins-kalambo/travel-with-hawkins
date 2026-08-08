import { getJourneyPickupLabel, type JourneyDirection } from "@/lib/journeyDirection";

export type ActiveRoute = {
  id: string;
  fare: number;
  pickupLabel: string | null;
  districtPointLabel: string | null;
  campusPointLabel: string | null;
  direction: JourneyDirection;
};

function parseRoutesResponse(data: unknown): ActiveRoute[] {
  const record = data as { success?: boolean; routes?: unknown } | null;
  if (!record?.success || !Array.isArray(record.routes)) return [];
  return record.routes
    .map((r): ActiveRoute => {
      const row = r as Record<string, unknown>;
      const pickupPoint = row.pickupPoint as Record<string, unknown> | null | undefined;
      const districtPickupPoint = row.districtPickupPoint as Record<string, unknown> | null | undefined;
      const direction = row.direction === "from_university" ? "from_university" : "to_university";
      const campusPointLabel = pickupPoint?.label ? String(pickupPoint.label) : null;
      const districtPointLabel = districtPickupPoint?.label ? String(districtPickupPoint.label) : null;
      return {
        id: String(row.id ?? ""),
        fare: Number(row.fare ?? 0) || 0,
        pickupLabel: getJourneyPickupLabel(direction, districtPointLabel, campusPointLabel, "", ""),
        districtPointLabel,
        campusPointLabel,
        direction,
      };
    })
    .filter((r) => r.id);
}

// Used by the booking form's district + university picker to resolve which
// — if any — active route(s) exist for a leg, mirroring the server-side
// resolution app/book/page.tsx already does for the search-driven flow.
// Falls back to an empty list on any failure; callers should treat that the
// same as "no configured route yet" rather than erroring the form.
export async function fetchActiveRoutes(homeDistrict: string, universityId: string, direction: JourneyDirection): Promise<ActiveRoute[]> {
  try {
    const params = new URLSearchParams({ originDistrict: homeDistrict, universityId, direction, status: "active" });
    const res = await fetch(`/api/routes?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) return [];
    return parseRoutesResponse(await res.json());
  } catch {
    return [];
  }
}
