import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isUniversityAvailableForPurpose, type UniversityPurpose } from "@/lib/universityPolicy";

type UniversityRow = { id: string; name: string; short_code: string; status: string };
export type ResolvedUniversity = Pick<UniversityRow, "id" | "name" | "short_code">;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function matches(candidate: UniversityRow, suppliedName: string): boolean {
  const supplied = normalize(suppliedName);
  const name = normalize(candidate.name);
  return supplied === name || supplied === normalize(candidate.short_code) || name.startsWith(`${supplied} (`);
}

async function resolveUniversityForPurpose(input: {
  universityId?: unknown;
  universityName?: unknown;
}, purpose: UniversityPurpose): Promise<ResolvedUniversity> {
  const universityId = typeof input.universityId === "string" ? input.universityId.trim() : "";
  const universityName = typeof input.universityName === "string" ? input.universityName.trim() : "";
  const { data, error } = await supabaseAdmin
    .from("universities")
    .select("id, name, short_code, status")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message || "Unable to verify university");
  const universities = ((data ?? []) as UniversityRow[]).filter((row) => isUniversityAvailableForPurpose(row.status, purpose));
  const byId = universityId ? universities.find((row) => row.id === universityId) : undefined;

  if (universityId && !byId) throw new Error(purpose === "booking" ? "The selected university is not active or does not exist" : "The selected university does not exist");
  if (byId) {
    if (universityName && !matches(byId, universityName)) {
      throw new Error("The selected university does not match the supplied university name");
    }
    return { id: byId.id, name: byId.name, short_code: byId.short_code };
  }

  if (!universityName) throw new Error("A valid university is required");
  const nameMatches = universities.filter((row) => matches(row, universityName));
  if (nameMatches.length !== 1) {
    throw new Error(nameMatches.length === 0
      ? purpose === "booking" ? "The selected university is not active or does not exist" : "The selected university does not exist"
      : "The university name is ambiguous; select it from the university list");
  }
  return { id: nameMatches[0].id, name: nameMatches[0].name, short_code: nameMatches[0].short_code };
}

export function resolveActiveUniversity(input: { universityId?: unknown; universityName?: unknown }): Promise<ResolvedUniversity> {
  return resolveUniversityForPurpose(input, "booking");
}

export function resolveExistingUniversity(input: { universityId?: unknown; universityName?: unknown }): Promise<ResolvedUniversity> {
  return resolveUniversityForPurpose(input, "recruitment");
}
