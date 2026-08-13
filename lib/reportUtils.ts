import type { BookingRecord } from "@/lib/bookingTypes";
import { calcBookingRevenue } from "@/lib/bookingRevenue";
import { resolveRouteFareIfAvailable } from "@/lib/routePricing";

// Supabase query builders expose a wider API than the minimal helper interface.
// This helper accepts any query type as long as it supports the filter methods.
// Returning the same generic type keeps the caller's full query type intact.
export type FilterableQuery<T = unknown> = T & {
  eq?: (field: string, value: unknown) => FilterableQuery<T>;
  ilike?: (field: string, pattern: string) => FilterableQuery<T>;
  gte?: (field: string, value: unknown) => FilterableQuery<T>;
  lte?: (field: string, value: unknown) => FilterableQuery<T>;
};

export type ReportFilters = {
  tripId?: string;
  travelDate?: string;
  destination?: string;
  pickup?: string;
  status?: string;
  bookingFeeStatus?: string;
  fareStatus?: string;
  startDate?: string;
  endDate?: string;
  minSeats?: string;
  maxSeats?: string;
  limit?: string;
  offset?: string;
};

export function parseReportFilters(params: URLSearchParams): ReportFilters {
  const value = (key: string) => {
    const raw = params.get(key);
    return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
  };

  return {
    tripId: value("tripId"),
    travelDate: value("travelDate"),
    destination: value("destination"),
    pickup: value("pickup"),
    status: value("status"),
    bookingFeeStatus: value("bookingFeeStatus"),
    fareStatus: value("fareStatus"),
    startDate: value("startDate"),
    endDate: value("endDate"),
    minSeats: value("minSeats"),
    maxSeats: value("maxSeats"),
    limit: value("limit"),
    offset: value("offset"),
  };
}

export function applyReportFilters<T extends FilterableQuery>(query: T, filters: ReportFilters): T {
  let result: T = query;

  if (filters.tripId && result.eq) {
    result = result.eq("trip_id", filters.tripId) as T;
  }

  if (filters.travelDate && result.eq) {
    result = result.eq("travel_date", filters.travelDate) as T;
  }

  if (filters.destination && result.ilike) {
    result = result.ilike("destination", `%${filters.destination}%`) as T;
  }

  if (filters.pickup && result.ilike) {
    result = result.ilike("pickup", `%${filters.pickup}%`) as T;
  }

  if (filters.status && result.eq) {
    result = result.eq("status", filters.status) as T;
  }

  if (filters.bookingFeeStatus && result.eq) {
    result = result.eq("booking_fee_status", filters.bookingFeeStatus) as T;
  }

  if (filters.fareStatus && result.eq) {
    result = result.eq("fare_status", filters.fareStatus) as T;
  }

  if (filters.startDate && result.gte) {
    result = result.gte("travel_date", filters.startDate) as T;
  }

  if (filters.endDate && result.lte) {
    result = result.lte("travel_date", filters.endDate) as T;
  }

  if (filters.minSeats && result.gte) {
    result = result.gte("seats", Number(filters.minSeats)) as T;
  }

  if (filters.maxSeats && result.lte) {
    result = result.lte("seats", Number(filters.maxSeats)) as T;
  }

  return result;
}

// routesStr is optional so existing callers that only need the count-based
// fields (never revenue) don't need to thread settings through — revenue
// fields simply come back as 0 without it.
export function summarizeReportRows(rows: BookingRecord[], routesStr?: string | Record<string, unknown>) {
  const totalSeats = rows.reduce((sum, row) => sum + (row.seats || 1), 0);
  const totalTrips = new Set(rows.map((row) => String(row.tripId || "").trim()).filter(Boolean)).size;
  const bookingFeePaid = rows.filter((row) => row.bookingFeeStatus === "paid").length;
  const fareSettled = rows.filter((row) => row.fareStatus === "paid" || row.fareStatus === "cash_collected").length;
  const confirmedJourneys = rows.filter((row) => row.status === "Confirmed").length;
  const completedJourneys = rows.filter((row) => row.status === "Completed" || row.status === "Arrived").length;
  const cancelledJourneys = rows.filter((row) => row.status === "Cancelled").length;

  let bookingFeeRevenue = 0;
  let fareRevenue = 0;
  let outstandingBookingFee = 0;
  let outstandingFare = 0;

  for (const row of rows) {
    const revenue = calcBookingRevenue(row, routesStr);
    bookingFeeRevenue += revenue.bookingFee;
    fareRevenue += revenue.ticketRevenue;

    if (row.bookingFeeStatus !== "paid" && typeof row.bookingFeeAmount === "number") {
      outstandingBookingFee += row.bookingFeeAmount;
    }

    if (row.fareStatus !== "paid" && row.fareStatus !== "cash_collected") {
      const routePrice = resolveRouteFareIfAvailable(row.destination, routesStr) ?? 0;
      const ticketPrice = typeof row.fare === "number" && Number.isFinite(row.fare) && row.fare > 0 ? row.fare : routePrice;
      outstandingFare += ticketPrice * (row.seats || 1);
    }
  }

  return {
    totalTrips,
    totalPassengers: rows.length,
    totalSeats,
    confirmedJourneys,
    completedJourneys,
    cancelledJourneys,
    bookingFeePaid,
    fareSettled,
    bookingFeeRevenue,
    fareRevenue,
    totalRevenue: bookingFeeRevenue + fareRevenue,
    outstandingBookingFee,
    outstandingFare,
  };
}

export function groupByTrip(rows: BookingRecord[]) {
  return rows.reduce<Record<string, BookingRecord[]>>((acc, row) => {
    const tripId = String(row.tripId || "").trim() || "Unknown Trip";
    if (!acc[tripId]) acc[tripId] = [];
    acc[tripId].push(row);
    return acc;
  }, {});
}

export function groupByDateThenTrip(rows: BookingRecord[]) {
  return rows.reduce<Record<string, Record<string, BookingRecord[]>>>((acc, row) => {
    const travelDate = String(row.travelDate || "").trim() || "Unknown Date";
    const tripId = String(row.tripId || "").trim() || "Unknown Trip";
    if (!acc[travelDate]) acc[travelDate] = {};
    if (!acc[travelDate][tripId]) acc[travelDate][tripId] = [];
    acc[travelDate][tripId].push(row);
    return acc;
  }, {});
}
