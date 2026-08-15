import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// The internal operator Stage 1 backfilled every pre-existing route/booking
// onto (db/migrations/2026_08_10_operators_fleet_foundation.sql). Anything
// still booked through the legacy free-text route matcher (no structured
// routeId) has no other way to resolve an operator, so it falls back here —
// this keeps every booking operator-attributed without forcing the legacy
// path to be ripped out in the same change that adds the column.
let cachedDefaultOperatorId: string | null | undefined;

export async function resolveDefaultOperatorId(): Promise<string | null> {
  if (cachedDefaultOperatorId !== undefined) return cachedDefaultOperatorId;

  const { data, error } = await supabaseAdmin.from("operators").select("id").eq("display_name", "Travel With Hawkins").maybeSingle();

  if (error || !data) {
    cachedDefaultOperatorId = null;
    return null;
  }

  cachedDefaultOperatorId = data.id as string;
  return cachedDefaultOperatorId;
}
