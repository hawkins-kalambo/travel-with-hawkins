"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createCsvFromBookings } from "@/lib/csvUtils";
import { generatePassengerManifestPdfBlob } from "@/lib/reportPdf";
import type { BookingRecord } from "@/lib/bookingTypes";
import { groupByDateThenTrip, groupByTrip, summarizeReportRows } from "@/lib/reportUtils";
import { authFetch } from "@/lib/auth";
import { BOOKING_FEE_STATUS_VALUES, FARE_STATUS_VALUES } from "@/lib/paymentTypes";
import { formatMwk } from "@/lib/currency";
import { calcBookingRevenue } from "@/lib/bookingRevenue";

type ReportSummary = ReturnType<typeof summarizeReportRows>;

const EMPTY_SUMMARY: ReportSummary = summarizeReportRows([]);

const REPORT_TYPES = [
  { key: "tripManifest", label: "Trip Manifest" },
  { key: "dailyPassenger", label: "Daily Passenger Report" },
  { key: "routeReport", label: "Route Report" },
] as const;

type ReportType = (typeof REPORT_TYPES)[number]["key"];

const JOURNEY_STATUS_OPTIONS = ["Booked", "Confirmed", "Boarding", "Arrived", "Completed", "Cancelled"];
const DEFAULT_ROUTE_OPTIONS = [
  "Mzuzu - Lilongwe",
  "Mzuzu - Blantyre",
  "Mzuzu - Zomba",
  "Mzuzu - Kasungu",
  "Mzuzu - Karonga",
];

function parseRouteOptions(routesValue: string | undefined) {
  if (!routesValue) return DEFAULT_ROUTE_OPTIONS;

  return routesValue
    .split("\n")
    .map((line) => line.split(":")[0]?.trim())
    .filter((route): route is string => Boolean(route));
}

function formatDisplayDate(value: string | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { weekday: "short", year: "numeric", month: "short", day: "2-digit" });
}

function statusBadge(status?: string) {
  const label = status || "Booked";
  const colors: Record<string, string> = {
    Booked: "bg-[color:var(--warning)]/10 text-[color:var(--warning)] border-[color:var(--warning)]/20",
    Confirmed: "bg-[color:var(--info)]/10 text-[color:var(--info)] border-[color:var(--info)]/20",
    Boarding: "bg-[color:var(--warning)]/10 text-[color:var(--warning)] border-[color:var(--warning)]/20",
    Arrived: "bg-secondary-blue-extra text-info border-secondary-blue-light",
    Completed: "bg-primary-100 text-primary-700 border-primary-200",
    Cancelled: "bg-[color:var(--danger)]/10 text-[color:var(--danger)] border-[color:var(--danger)]/20",
  };
  return <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold border ${colors[label] ?? colors.Booked}`}>{label}</span>;
}

function moneyStatusBadge(status?: string) {
  const label = status || "unpaid";
  const colors: Record<string, string> = {
    unpaid: "bg-[color:var(--warning)]/10 text-[color:var(--warning)] border-[color:var(--warning)]/20",
    processing: "bg-sky-50 text-sky-700 border-sky-200",
    paid: "bg-primary-100 text-primary-700 border-primary-200",
    cash_selected: "bg-amber-50 text-amber-700 border-amber-200",
    cash_collected: "bg-primary-100 text-primary-700 border-primary-200",
    failed: "bg-[color:var(--danger)]/10 text-[color:var(--danger)] border-[color:var(--danger)]/20",
    refunded: "bg-slate-100 text-slate-600 border-slate-200",
    partially_refunded: "bg-slate-100 text-slate-600 border-slate-200",
    partially_paid: "bg-amber-50 text-amber-700 border-amber-200",
  };
  const display = label.split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
  return <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold border ${colors[label] ?? colors.unpaid}`}>{display}</span>;
}

function SummaryTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-3xl border border-[#d7ebff] p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-primary-900">{value}</p>
    </div>
  );
}

function RevenueTile({ label, amount, tone = "default" }: { label: string; amount: number; tone?: "default" | "highlight" | "warning" }) {
  const toneClasses =
    tone === "highlight"
      ? "border-[#0f3f78]/30 bg-[#0f3f78] text-white"
      : tone === "warning"
        ? "border-[color:var(--warning)]/20 bg-[color:var(--warning)]/10 text-[color:var(--warning)]"
        : "border-[#d7ebff] bg-[#eef6ff] text-primary-900";
  return (
    <div className={`rounded-3xl border p-4 ${toneClasses}`}>
      <p className={`text-xs ${tone === "highlight" ? "text-white/70" : "text-slate-500"}`}>{label}</p>
      <p className="mt-2 text-xl font-black">{formatMwk(amount)}</p>
    </div>
  );
}

function buildQueryString(filters: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

export default function AdminReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("tripManifest");
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [filters, setFilters] = useState<Record<string, string | undefined>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<BookingRecord | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [paginationMeta, setPaginationMeta] = useState<{ limit: number; offset: number; count: number; totalCount: number } | null>(
    null
  );
  const [savedRoutes, setSavedRoutes] = useState<string[]>(DEFAULT_ROUTE_OPTIONS);
  // Summary/revenue totals come from the server, computed over the FULL
  // filtered set — never derived from `bookings` (which is just the current
  // page), or these numbers would silently under-report anything beyond
  // page 1. See app/api/reports/route.ts.
  const [summary, setSummary] = useState<ReportSummary>(EMPTY_SUMMARY);
  const [truncated, setTruncated] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const canSearch = useMemo(() => {
    if (reportType === "tripManifest") return Boolean(filters.tripId?.trim());
    if (reportType === "dailyPassenger") return Boolean(filters.travelDate?.trim());
    if (reportType === "routeReport") return Boolean(filters.destination?.trim());
    return false;
  }, [filters, reportType]);

  const groupedByTrip = useMemo(() => groupByTrip(bookings), [bookings]);
  const groupedByDateTrip = useMemo(() => groupByDateThenTrip(bookings), [bookings]);

  useEffect(() => {
    let active = true;

    const loadSavedRoutes = async () => {
      try {
        const res = await authFetch("/api/settings", { method: "GET", cache: "no-store" });
        if (!res.ok) throw new Error(`Unable to load routes (${res.status})`);

        const data = (await res.json()) as {
          settings?: {
            routes?: string | null;
          };
        };

        const rawRoutes = typeof data?.settings?.routes === "string" ? data.settings.routes : "";
        const routes = parseRouteOptions(rawRoutes || undefined);
        if (active) setSavedRoutes(routes);
      } catch {
        if (active) setSavedRoutes(DEFAULT_ROUTE_OPTIONS);
      }
    };

    void loadSavedRoutes();

    return () => {
      active = false;
    };
  }, []);

  const handleSearch = async (nextPage = 1, nextPageSize = pageSize) => {
    setError(null);
    setLoading(true);
    setSelectedRow(null);
    setPageNumber(nextPage);

    try {
      const offset = (nextPage - 1) * nextPageSize;
      const query = buildQueryString({
        ...filters,
        limit: String(nextPageSize),
        offset: String(offset),
      });
      const url = query ? `/api/reports?${query}` : "/api/reports";
      const res = await authFetch(url, { cache: "no-store" });
      const data = (await res.json()) as {
        success?: boolean;
        bookings?: BookingRecord[];
        pagination?: { limit: number; offset: number; count: number; totalCount: number };
        summary?: ReportSummary;
        truncated?: boolean;
        error?: string;
      };

      if (!res.ok || data.success !== true) {
        throw new Error(data.error || `Unable to load report (${res.status})`);
      }

      setBookings(Array.isArray(data.bookings) ? data.bookings : []);
      setPaginationMeta(data.pagination ?? null);
      setSummary(data.summary ?? EMPTY_SUMMARY);
      setTruncated(Boolean(data.truncated));
      setLoadedOnce(true);
    } catch (err) {
      setBookings([]);
      setPaginationMeta(null);
      setSummary(EMPTY_SUMMARY);
      setTruncated(false);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFilters({});
    setBookings([]);
    setError(null);
    setSelectedRow(null);
    setLoadedOnce(false);
    setPageNumber(1);
    setPaginationMeta(null);
    setSummary(EMPTY_SUMMARY);
    setTruncated(false);
  };

  // Shared by both exports — the visible `bookings` list is deliberately a
  // small page; an export must reflect every row the current filter
  // matches, not just what's on screen.
  const fetchFullFilteredSet = async (): Promise<BookingRecord[]> => {
    const query = buildQueryString({ ...filters, full: "1" });
    const url = `/api/reports?${query}`;
    const res = await authFetch(url, { cache: "no-store" });
    const data = (await res.json()) as { success?: boolean; bookings?: BookingRecord[]; error?: string };
    if (!res.ok || data.success !== true) {
      throw new Error(data.error || `Unable to load full report data (${res.status})`);
    }
    return Array.isArray(data.bookings) ? data.bookings : [];
  };

  const handleDownloadCsv = async () => {
    if (bookings.length === 0) return;
    setError(null);
    setExporting("csv");
    try {
      const fullRows = await fetchFullFilteredSet();
      const csv = createCsvFromBookings(fullRows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `twh-${reportType}-report.csv`;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("CSV export failed", err);
      setError(err instanceof Error ? err.message : "Unable to export CSV. Please try again.");
    } finally {
      setExporting(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (bookings.length === 0) return;
    setError(null);
    setExporting("pdf");

    try {
      const fullRows = await fetchFullFilteredSet();
      const fullSummary = summarizeReportRows(fullRows);
      const metadata = {
        "Report Type": REPORT_TYPES.find((item) => item.key === reportType)?.label,
        "Trip ID": filters.tripId || undefined,
        "Travel Date": filters.travelDate || undefined,
        Destination: filters.destination || undefined,
        Pickup: filters.pickup || undefined,
        Status: filters.status || undefined,
        "Booking Fee Status": filters.bookingFeeStatus || undefined,
        "Fare Status": filters.fareStatus || undefined,
        "Booking Fees Collected": formatMwk(fullSummary.bookingFeeRevenue),
        "Fares Collected": formatMwk(fullSummary.fareRevenue),
        "Total Collected": formatMwk(fullSummary.totalRevenue),
      };

      const blob = generatePassengerManifestPdfBlob(
        `${REPORT_TYPES.find((item) => item.key === reportType)?.label ?? "Manifest Report"}`,
        metadata,
        fullRows
      );

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `twh-${reportType}-manifest.pdf`;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF export failed", err);
      setError(err instanceof Error ? err.message : "Unable to generate PDF. Please try again.");
    } finally {
      setExporting(null);
    }
  };

  const renderReportSummary = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8 gap-3">
        <SummaryTile label="Total Trips" value={summary.totalTrips} />
        <SummaryTile label="Total Passengers" value={summary.totalPassengers} />
        <SummaryTile label="Total Seats" value={summary.totalSeats} />
        <SummaryTile label="Confirmed Journeys" value={summary.confirmedJourneys} />
        <SummaryTile label="Completed Journeys" value={summary.completedJourneys} />
        <SummaryTile label="Cancelled Journeys" value={summary.cancelledJourneys} />
        <SummaryTile label="Booking Fees Paid" value={summary.bookingFeePaid} />
        <SummaryTile label="Fares Settled" value={summary.fareSettled} />
      </div>

      <div className="rounded-3xl border border-[#d7ebff] bg-white p-5 shadow-sm">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-slate-500">Revenue — full filtered result{truncated ? " (capped)" : ""}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <RevenueTile label="Total Collected" amount={summary.totalRevenue} tone="highlight" />
          <RevenueTile label="Booking Fees Collected" amount={summary.bookingFeeRevenue} />
          <RevenueTile label="Fares Collected" amount={summary.fareRevenue} />
          <RevenueTile label="Outstanding Booking Fees" amount={summary.outstandingBookingFee} tone="warning" />
          <RevenueTile label="Outstanding Fares" amount={summary.outstandingFare} tone="warning" />
        </div>
      </div>

      {truncated && paginationMeta && (
        <div className="rounded-2xl border border-[color:var(--warning)]/20 bg-[color:var(--warning)]/10 p-3 text-xs text-[color:var(--warning)]">
          This filter matches {paginationMeta.totalCount.toLocaleString()} records — totals and exports above reflect the first{" "}
          {summary.totalPassengers.toLocaleString()} only. Narrow your filters (e.g. a shorter date range) for complete totals.
        </div>
      )}
    </div>
  );

  const renderGroupedReport = () => {
    if (reportType === "tripManifest") {
      if (!filters.tripId) {
        return (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-600">
            Enter a Trip ID and click Search to load the manifest.
          </div>
        );
      }

      return (
        <div className="space-y-4">
          {Object.entries(groupedByTrip).map(([tripId, tripRows]) => (
            <div key={tripId} className="rounded-3xl border border-[#d7ebff] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Trip Manifest</p>
                  <h3 className="text-lg font-semibold text-primary-900">{tripId}</h3>
                </div>
                <div className="text-right text-sm text-slate-500">
                  <p>{tripRows.length} passenger{tripRows.length === 1 ? "" : "s"}</p>
                  <p>{tripRows.reduce((sum, row) => sum + (row.seats || 1), 0)} seats</p>
                </div>
              </div>
              {renderTable(tripRows)}
            </div>
          ))}
        </div>
      );
    }

    if (reportType === "dailyPassenger") {
      if (!filters.travelDate) {
        return (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-600">
            Select a travel date and click Search to load passengers for the day.
          </div>
        );
      }

      return (
        <div className="space-y-4">
          {Object.entries(groupedByTrip).map(([tripId, tripRows]) => (
            <div key={tripId} className="rounded-3xl border border-[#d7ebff] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Trip</p>
                  <h3 className="text-lg font-semibold text-primary-900">{tripId}</h3>
                </div>
                <div className="text-right text-sm text-slate-500">
                  <p>{tripRows.length} passenger{tripRows.length === 1 ? "" : "s"}</p>
                  <p>{tripRows.reduce((sum, row) => sum + (row.seats || 1), 0)} seats</p>
                </div>
              </div>
              {renderTable(tripRows)}
            </div>
          ))}
        </div>
      );
    }

    if (reportType === "routeReport") {
      if (!filters.destination) {
        return (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-600">
            Enter a destination and optional date range, then click Search to generate a route report.
          </div>
        );
      }

      return (
        <div className="space-y-4">
          {Object.entries(groupedByDateTrip).map(([travelDate, trips]) => (
            <div key={travelDate} className="rounded-3xl border border-[#d7ebff] bg-white p-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Travel Date</p>
                  <h3 className="text-lg font-semibold text-primary-900">{formatDisplayDate(travelDate)}</h3>
                </div>
                <p className="text-sm text-slate-500">{Object.keys(trips).length} trip{Object.keys(trips).length === 1 ? "" : "s"}</p>
              </div>
              <div className="space-y-4">
                {Object.entries(trips).map(([tripId, tripRows]) => (
                  <div key={tripId} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <p className="text-sm font-semibold text-primary-900">{tripId}</p>
                      <span className="text-sm text-slate-500">{tripRows.length} passenger{tripRows.length === 1 ? "" : "s"}</span>
                    </div>
                    {renderTable(tripRows)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  const renderTable = (rows: BookingRecord[]) => {
    return (
      <>
        <div className="space-y-3 md:hidden">
          {rows.map((row) => (
            <div key={`${row.bookingId}-${row.studentId}-${row.phone}`} className="rounded-2xl border border-[#d7ebff] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Passenger</p>
                  <p className="mt-1 text-sm font-semibold text-primary-900 wrap-break-word">{row.name || "—"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRow(row)}
                  className="rounded-full border border-accent-600 px-3 py-1 text-[12px] font-semibold text-primary-900 hover:bg-accent-100"
                >
                  View
                </button>
              </div>
              <dl className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Trip ID</dt>
                  <dd className="text-right font-medium break-all">{row.tripId || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Booking ID</dt>
                  <dd className="text-right font-medium break-all">{row.bookingId || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Phone</dt>
                  <dd className="text-right font-medium break-all">{row.phone || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Destination</dt>
                  <dd className="text-right font-medium break-all">{row.destination || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Travel Date</dt>
                  <dd className="text-right font-medium">{formatDisplayDate(row.travelDate)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Seats</dt>
                  <dd className="text-right font-medium">{row.seats || 1}</dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="text-slate-500">Status</dt>
                  <dd className="flex flex-wrap gap-2">
                    {statusBadge(row.status)}
                    {moneyStatusBadge(row.bookingFeeStatus)}
                    {moneyStatusBadge(row.fareStatus)}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        <div className="hidden md:block overflow-x-auto rounded-3xl border border-[#d7ebff]">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Booking ID</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Trip ID</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Student</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Student ID</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Phone</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Destination</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Pickup</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Travel Date</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Seats</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Journey Status</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Booking Fee</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Fare</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {rows.map((row) => (
                <tr key={`${row.bookingId}-${row.studentId}-${row.phone}`}>
                  <td className="px-3 py-3 text-slate-700">{row.bookingId || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{row.tripId || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{row.name || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{row.studentId || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{row.phone || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{row.destination || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{row.pickup || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{formatDisplayDate(row.travelDate)}</td>
                  <td className="px-3 py-3 text-slate-700">{row.seats || 1}</td>
                  <td className="px-3 py-3">{statusBadge(row.status)}</td>
                  <td className="px-3 py-3">{moneyStatusBadge(row.bookingFeeStatus)}</td>
                  <td className="px-3 py-3">{moneyStatusBadge(row.fareStatus)}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedRow(row)}
                      className="rounded-full border border-accent-600 px-3 py-1 text-[12px] font-semibold text-primary-900 hover:bg-accent-100"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  };

  return (
      <div className="min-h-screen bg-[#f4f8fd] text-[#101815]">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-8">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-primary-900">Reports & Manifests</h1>
            <p className="mt-2 text-sm text-slate-600">Generate trip manifests, daily passenger reports and route reports for admin operations.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin" className="btn-secondary inline-flex items-center justify-center gap-2">
              ← Back to Admin
            </Link>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4 rounded-3xl border border-[#d7ebff] bg-[#eef6ff] p-5 shadow-sm xl:sticky xl:top-4 xl:h-fit">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Report Selector</p>
              {REPORT_TYPES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setReportType(item.key)}
                  className={`w-full rounded-3xl px-4 py-3 text-left text-sm font-semibold transition ${reportType === item.key ? "bg-accent-600 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-[#d7ebff] bg-[#dbeafe] p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Filters</p>
                <div className="space-y-3 mt-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Trip ID</label>
                    <input
                      value={filters.tripId ?? ""}
                      onChange={(event) => setFilters((prev) => ({ ...prev, tripId: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600/50"
                      placeholder="TRIP-20240623-MZUZU-LILONGWE-01"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Travel Date</label>
                    <input
                      type="date"
                      value={filters.travelDate ?? ""}
                      onChange={(event) => setFilters((prev) => ({ ...prev, travelDate: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Destination / Route</label>
                    <select
                      value={filters.destination && savedRoutes.includes(filters.destination) ? filters.destination : "__custom__"}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === "__custom__") {
                          setFilters((prev) => ({ ...prev, destination: "" }));
                          return;
                        }
                        setFilters((prev) => ({ ...prev, destination: value }));
                      }}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600/50"
                    >
                      <option value="__custom__">Custom route…</option>
                      {savedRoutes.map((route) => (
                        <option key={route} value={route}>
                          {route}
                        </option>
                      ))}
                    </select>
                    <input
                      value={filters.destination ?? ""}
                      onChange={(event) => setFilters((prev) => ({ ...prev, destination: event.target.value }))}
                      className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600/50"
                      placeholder="Or type a route manually"
                    />
                    <p className="mt-2 text-[11px] text-slate-500">Choose a saved route or type your own destination manually.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Pickup Location</label>
                    <input
                      value={filters.pickup ?? ""}
                      onChange={(event) => setFilters((prev) => ({ ...prev, pickup: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600/50"
                      placeholder="Mzuzu University"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Journey Status</label>
                    <select
                      value={filters.status ?? ""}
                      onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600/50"
                    >
                      <option value="">Any</option>
                      {JOURNEY_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Booking Fee Status</label>
                    <select
                      value={filters.bookingFeeStatus ?? ""}
                      onChange={(event) => setFilters((prev) => ({ ...prev, bookingFeeStatus: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600/50"
                    >
                      <option value="">Any</option>
                      {BOOKING_FEE_STATUS_VALUES.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fare Status</label>
                    <select
                      value={filters.fareStatus ?? ""}
                      onChange={(event) => setFilters((prev) => ({ ...prev, fareStatus: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600/50"
                    >
                      <option value="">Any</option>
                      {FARE_STATUS_VALUES.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Date Range</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={filters.startDate ?? ""}
                        onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600/50"
                      />
                      <input
                        type="date"
                        value={filters.endDate ?? ""}
                        onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600/50"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Min Seats</label>
                      <input
                        type="number"
                        min="1"
                        value={filters.minSeats ?? ""}
                        onChange={(event) => setFilters((prev) => ({ ...prev, minSeats: event.target.value }))}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Max Seats</label>
                      <input
                        type="number"
                        min="1"
                        value={filters.maxSeats ?? ""}
                        onChange={(event) => setFilters((prev) => ({ ...prev, maxSeats: event.target.value }))}
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600/50"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between xl:flex-col">
                <button
                  type="button"
                  onClick={() => handleSearch(1)}
                  disabled={!canSearch || loading}
                  className="w-full rounded-3xl bg-[#0f3f78] px-4 py-3 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 sm:w-auto xl:w-full"
                >
                  {loading ? "Loading report…" : "Search"}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto xl:w-full"
                >
                  Reset
                </button>
              </div>
            </div>
          </aside>

          <section className="space-y-6">
            <div className="rounded-3xl border border-[#d7ebff] bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Current Report</p>
                  <h2 className="text-2xl font-bold text-primary-900">{REPORT_TYPES.find((item) => item.key === reportType)?.label}</h2>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => void handleDownloadPdf()}
                    disabled={bookings.length === 0 || exporting !== null}
                    className="w-full rounded-3xl bg-[#0f3f78] px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-50 hover:bg-[#0a2d56] sm:w-auto"
                  >
                    {exporting === "pdf" ? "Preparing PDF…" : "Download PDF"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadCsv()}
                    disabled={bookings.length === 0 || exporting !== null}
                    className="w-full rounded-3xl border border-[#d7ebff] bg-[#eef6ff] px-4 py-3 text-sm font-semibold text-[#101815] transition hover:bg-[#dbeafe] disabled:opacity-50 sm:w-auto"
                  >
                    {exporting === "csv" ? "Preparing CSV…" : "Export CSV"}
                  </button>
                </div>
              </div>

              <p className="mt-4 text-sm text-slate-500">
                Use the advanced filter panel to narrow results. Reports are grouped for each selected report type. PDF/CSV exports and
                the totals above always cover every matching record, not just the page shown below.
              </p>
              <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm text-slate-600">
                  {loadedOnce
                    ? `Showing ${bookings.length} of ${(paginationMeta?.totalCount ?? bookings.length).toLocaleString()} record${(paginationMeta?.totalCount ?? bookings.length) === 1 ? "" : "s"} • page ${pageNumber} of ${Math.max(1, Math.ceil((paginationMeta?.totalCount ?? bookings.length) / pageSize))}`
                    : "No results loaded yet"}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <label className="text-sm text-slate-600">
                    <span className="mr-2">Rows</span>
                    <select
                      value={pageSize}
                      onChange={(event) => {
                        const nextSize = Number(event.target.value);
                        setPageSize(nextSize);
                        void handleSearch(1, nextSize);
                      }}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:w-auto"
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleSearch(Math.max(1, pageNumber - 1))}
                    disabled={pageNumber === 1 || loading}
                    className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSearch(pageNumber + 1)}
                    disabled={pageNumber * pageSize >= (paginationMeta?.totalCount ?? 0) || loading}
                    className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

            {loadedOnce && renderReportSummary()}

            {error ? (
              <div className="rounded-3xl border border-[color:var(--danger)]/20 bg-[color:var(--danger)]/10 p-6 text-sm text-[color:var(--danger)]">{error}</div>
            ) : null}

            {loading ? (
              <div className="rounded-3xl border border-[#d7ebff] bg-[#eef6ff] p-10 text-center text-slate-500">
                Loading report results…
              </div>
            ) : (
              renderGroupedReport()
            )}

            {selectedRow ? (
              <div className="rounded-3xl border border-[#d7ebff] bg-[#eef6ff] p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Passenger Details</p>
                    <h3 className="mt-2 text-xl font-semibold text-primary-900">{selectedRow.name || "—"}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedRow(null)}
                    className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 mt-6">
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500">Booking ID</p>
                    <p className="font-semibold text-slate-900">{selectedRow.bookingId || "—"}</p>
                    <p className="text-sm text-slate-500">Trip ID</p>
                    <p className="font-semibold text-slate-900">{selectedRow.tripId || "—"}</p>
                    <p className="text-sm text-slate-500">Student ID</p>
                    <p className="font-semibold text-slate-900">{selectedRow.studentId || "—"}</p>
                    <p className="text-sm text-slate-500">Booking Fee</p>
                    <div className="flex items-center gap-2">
                      {moneyStatusBadge(selectedRow.bookingFeeStatus)}
                      {selectedRow.bookingFeeStatus === "paid" && (
                        <span className="text-sm font-semibold text-slate-900">
                          {formatMwk(calcBookingRevenue(selectedRow).bookingFee)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500">Phone</p>
                    <p className="font-semibold text-slate-900">{selectedRow.phone || "—"}</p>
                    <p className="text-sm text-slate-500">Destination</p>
                    <p className="font-semibold text-slate-900">{selectedRow.destination || "—"}</p>
                    <p className="text-sm text-slate-500">Travel Date</p>
                    <p className="font-semibold text-slate-900">{formatDisplayDate(selectedRow.travelDate)}</p>
                    <p className="text-sm text-slate-500">Transport Fare</p>
                    <div className="flex items-center gap-2">
                      {moneyStatusBadge(selectedRow.fareStatus)}
                      {(selectedRow.fareStatus === "paid" || selectedRow.fareStatus === "cash_collected") && (
                        <span className="text-sm font-semibold text-slate-900">
                          {formatMwk(calcBookingRevenue(selectedRow).ticketRevenue)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
