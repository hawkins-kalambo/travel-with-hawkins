import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/apiResponse";
import { requireOperatorUser } from "@/lib/operatorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeBookingRecord } from "@/lib/bookingServerUtils";

// D14 (operator bookings view) — read-only. operator_id is set on every
// booking's insert path (app/api/bookings/route.ts), including the
// free-text/legacy fallback via resolveDefaultOperatorId(), so a strict
// .eq("operator_id", ...) filter works uniformly across intercity/taxi/
// car_hire. Mirrors app/api/admin/bookings/route.ts's own GET shape
// (select *, order by created_at desc, normalizeBookingRecord per row) so
// a future richer operator UI can reuse the same display components.
export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireOperatorUser(request, response, "viewBookings");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("*")
    .eq("operator_id", auth.operatorId)
    .order("created_at", { ascending: false });

  if (error) return jsonError("Unable to load bookings", 500);

  const bookings = (data ?? []).map((row) => normalizeBookingRecord(row as Record<string, unknown>));

  return NextResponse.json({ success: true, bookings });
}
