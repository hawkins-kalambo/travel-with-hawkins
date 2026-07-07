import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeBookingRecord } from "@/lib/bookingServerUtils";
import { parseReportFilters, applyReportFilters } from "@/lib/reportUtils";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function getUserEmail(user: { email?: string } | null | undefined) {
  return typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
}

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const { user, error } = await requireAuthenticatedUser(request, response);

  if (error || !user) {
    return jsonError("Authentication required", 401);
  }

  const allowedAdminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL;
  const userEmail = getUserEmail(user);
  const normalizedAllowed = typeof allowedAdminEmail === "string" ? allowedAdminEmail.trim().toLowerCase() : "";

  if (normalizedAllowed && userEmail && userEmail !== normalizedAllowed) {
    return jsonError("Admin access required", 403);
  }

  try {
    const url = new URL(request.url);
    const filters = parseReportFilters(url.searchParams);

    let query = supabaseAdmin.from("bookings").select("*");
    query = applyReportFilters(query, filters);
    query = query.order("travel_date", { ascending: true }).order("trip_id", { ascending: true });

    const limit = Number.parseInt(filters.limit ?? "", 10);
    const offset = Number.parseInt(filters.offset ?? "", 10);
    const pageSize = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 250;
    const start = Number.isFinite(offset) && offset > 0 ? offset : 0;

    query = query.range(start, start + pageSize - 1);

    const { data, error: fetchError } = await query;

    if (fetchError) {
      console.error("Failed to load report bookings", fetchError);
      return jsonError("Unable to load report data", 500);
    }

    const bookings = (data ?? []).map((row) => normalizeBookingRecord(row as Record<string, unknown>));

    return NextResponse.json({
      success: true,
      bookings,
      pagination: {
        limit: pageSize,
        offset: start,
        count: bookings.length,
      },
    });
  } catch (fetchError) {
    console.error("Report GET failed", fetchError);
    return jsonError(fetchError instanceof Error ? fetchError.message : "Unknown error");
  }
}
