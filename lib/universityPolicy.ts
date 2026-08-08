export type UniversityPurpose = "booking" | "recruitment";

export function isUniversityAvailableForPurpose(status: unknown, purpose: UniversityPurpose): boolean {
  if (status !== "active" && status !== "inactive") return false;
  return purpose === "recruitment" || status === "active";
}
