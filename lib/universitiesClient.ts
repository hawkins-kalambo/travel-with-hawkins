export type ActiveUniversity = { id: string; name: string };

function parseUniversitiesResponse(data: unknown): ActiveUniversity[] {
  const record = data as { success?: boolean; universities?: unknown } | null;
  if (!record?.success || !Array.isArray(record.universities)) return [];
  return record.universities
    .map((u) => {
      const row = u as Record<string, unknown>;
      return { id: String(row.id ?? ""), name: String(row.name ?? "") };
    })
    .filter((u) => u.id && u.name);
}

// Every university regardless of status — used where recruiting/managing a
// campus ahead of its own customer-facing launch is the point (e.g. the
// ambassador application form, which should let a student apply on behalf
// of a campus that isn't live yet).
export async function fetchAllUniversities(): Promise<ActiveUniversity[]> {
  try {
    const res = await fetch("/api/universities", { cache: "no-store" });
    if (!res.ok) return [];
    return parseUniversitiesResponse(await res.json());
  } catch {
    return [];
  }
}

// Used by the homepage trip search and /trips search — both need "which
// universities are actually live right now" rather than the static
// MALAWI_PUBLIC_UNIVERSITIES list, so that activating/deactivating a
// campus in the admin Universities page takes effect immediately without a
// deploy. Falls back to an empty list on any failure; callers should treat
// that the same as "nothing active yet" rather than erroring the page.
export async function fetchActiveUniversities(): Promise<ActiveUniversity[]> {
  try {
    const res = await fetch("/api/universities?status=active", { cache: "no-store" });
    if (!res.ok) return [];
    return parseUniversitiesResponse(await res.json());
  } catch {
    return [];
  }
}
