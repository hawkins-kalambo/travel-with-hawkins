export const JOURNEY_DIRECTIONS = ["to_university", "from_university"] as const;

export type JourneyDirection = (typeof JOURNEY_DIRECTIONS)[number];

export function isJourneyDirection(value: unknown): value is JourneyDirection {
  return typeof value === "string" && (JOURNEY_DIRECTIONS as readonly string[]).includes(value);
}

export function journeyDirectionLabel(direction: JourneyDirection) {
  return direction === "from_university" ? "Going home" : "Going to university";
}

export function buildJourneyName(homeDistrict: string, universityName: string, direction: JourneyDirection) {
  return direction === "from_university"
    ? `${universityName} - ${homeDistrict}`
    : `${homeDistrict} - ${universityName}`;
}

export function getJourneyEndpoints(homeDistrict: string, universityName: string, direction: JourneyDirection) {
  return direction === "from_university"
    ? { origin: universityName, destination: homeDistrict }
    : { origin: homeDistrict, destination: universityName };
}

export function getJourneyPickupLabel(
  direction: JourneyDirection,
  districtPointLabel: string | null | undefined,
  campusPointLabel: string | null | undefined,
  homeDistrict: string,
  universityName: string
): string {
  return direction === "from_university"
    ? campusPointLabel || universityName
    : districtPointLabel || homeDistrict;
}
