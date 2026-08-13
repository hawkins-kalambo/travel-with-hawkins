import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeBookingRecord } from "@/lib/bookingServerUtils";
import { parseReportFilters, applyReportFilters, summarizeReportRows } from "@/lib/reportUtils";
import { requireUniversityOperationsUser } from "@/lib/universityAdminAuth";
import { jsonError } from "@/lib/apiResponse";

// Hard ceiling on how many rows a single "full result set" fetch (summary
// aggregation or a full-export request) will ever pull in one response —
// protects against an unbounded query on a filter that matches almost the
// whole table. `truncated` in the response tells the caller when this was
// hit, so a report can never silently claim complete totals when it isn't.
const FULL_SET_CAP = 5000;

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const auth = await requireUniversityOperationsUser(request, response, "viewReports");
  if (!auth.authorized) return jsonError(auth.error, auth.status);

  try {
    const url = new URL(request.url);
    const filters = parseReportFilters(url.searchParams);
    // Used by CSV/PDF export and by the "download everything that matches
    // the filter" case — the paginated `bookings` list the table renders
    // from is deliberately capped small, but exports and summary totals
    // must reflect every matching row, not just the current page.
    const wantsFullSet = url.searchParams.get("full") === "1";

    const { data: settingsData } = await supabaseAdmin
      .from("settings")
      .select("routes")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const routesStr = (settingsData?.routes as string | undefined) ?? "";

    const buildBaseQuery = () => {
      let query = supabaseAdmin.from("bookings").select("*");
      if (!auth.isGlobal) query = query.in("university_id", auth.universityIds);
      query = applyReportFilters(query, filters);
      return query.order("travel_date", { ascending: true }).order("trip_id", { ascending: true });
    };

    // Exact total matching the filter — independent of whatever page/limit
    // is requested, so the UI can show "page 2 of 14" instead of guessing
    // from whether a page came back full.
    let countQuery = supabaseAdmin.from("bookings").select("*", { count: "exact", head: true });
    if (!auth.isGlobal) countQuery = countQuery.in("university_id", auth.universityIds);
    countQuery = applyReportFilters(countQuery, filters);
    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
      console.error("Failed to count report bookings", countError);
      return jsonError("Unable to load report data", 500);
    }

    // Full matching set for summary aggregation (revenue totals, journey
    // breakdowns) — this must never be computed from just the current page,
    // or "Total Passengers"/"Booking Fees Collected" etc. silently reflect
    // only the first 50-500 rows instead of everything the filter matched.
    const { data: fullData, error: fullError } = await buildBaseQuery().limit(FULL_SET_CAP);

    if (fullError) {
      console.error("Failed to load full report set", fullError);
      return jsonError("Unable to load report data", 500);
    }

    const fullRows = (fullData ?? []).map((row) => normalizeBookingRecord(row as Record<string, unknown>));
    const summary = summarizeReportRows(fullRows, routesStr);
    const truncated = (totalCount ?? 0) > fullRows.length;

    if (wantsFullSet) {
      return NextResponse.json({
        success: true,
        bookings: fullRows,
        pagination: { limit: fullRows.length, offset: 0, count: fullRows.length, totalCount: totalCount ?? fullRows.length },
        summary,
        truncated,
      });
    }

    const limit = Number.parseInt(filters.limit ?? "", 10);
    const offset = Number.parseInt(filters.offset ?? "", 10);
    const pageSize = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 250;
    const start = Number.isFinite(offset) && offset > 0 ? offset : 0;

    const { data: pageData, error: pageError } = await buildBaseQuery().range(start, start + pageSize - 1);

    if (pageError) {
      console.error("Failed to load report bookings", pageError);
      return jsonError("Unable to load report data", 500);
    }

    const bookings = (pageData ?? []).map((row) => normalizeBookingRecord(row as Record<string, unknown>));

    return NextResponse.json({
      success: true,
      bookings,
      pagination: {
        limit: pageSize,
        offset: start,
        count: bookings.length,
        totalCount: totalCount ?? bookings.length,
      },
      summary,
      truncated,
    });
  } catch (fetchError) {
    console.error("Report GET failed", fetchError);
    return jsonError(fetchError instanceof Error ? fetchError.message : "Unknown error");
  }
}
