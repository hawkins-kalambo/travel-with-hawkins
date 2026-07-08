import type { BookingRecord } from "@/lib/bookingTypes";

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
  paymentStatus?: string;
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
    paymentStatus: value("paymentStatus"),
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

  if (filters.paymentStatus && result.eq) {
    result = result.eq("payment_status", filters.paymentStatus) as T;
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

export function summarizeReportRows(rows: BookingRecord[]) {
  const totalSeats = rows.reduce((sum, row) => sum + (row.seats || 1), 0);
  const totalTrips = new Set(rows.map((row) => String(row.tripId || "").trim()).filter(Boolean)).size;
  const paymentConfirmed = rows.filter((row) => row.paymentStatus === "Payment Confirmed").length;
  const pendingPayments = rows.filter((row) => row.paymentStatus === "Pending").length;
  const confirmedJourneys = rows.filter((row) => row.status === "Confirmed").length;
  const completedJourneys = rows.filter((row) => row.status === "Completed" || row.status === "Arrived").length;
  const cancelledJourneys = rows.filter((row) => row.status === "Cancelled").length;

  return {
    totalTrips,
    totalPassengers: rows.length,
    totalSeats,
    confirmedJourneys,
    completedJourneys,
    cancelledJourneys,
    paymentConfirmed,
    pendingPayments,
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
