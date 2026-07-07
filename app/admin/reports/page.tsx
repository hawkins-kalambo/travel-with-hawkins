"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createCsvFromBookings } from "@/lib/csvUtils";
import { generatePassengerManifestPdfBlob } from "@/lib/reportPdf";
import type { BookingRecord } from "@/lib/bookingTypes";
import { groupByDateThenTrip, groupByTrip, summarizeReportRows } from "@/lib/reportUtils";
import { supabase } from "@/lib/auth";

const REPORT_TYPES = [
  { key: "tripManifest", label: "Trip Manifest" },
  { key: "dailyPassenger", label: "Daily Passenger Report" },
  { key: "routeReport", label: "Route Report" },
] as const;

type ReportType = (typeof REPORT_TYPES)[number]["key"];

const JOURNEY_STATUS_OPTIONS = ["Booked", "Confirmed", "Boarding", "Arrived", "Completed", "Cancelled"];
const PAYMENT_STATUS_OPTIONS = ["Pending", "Payment Confirmed", "Failed"];
const DEFAULT_ROUTE_OPTIONS = [
  "Mzuzu - Lilongwe",
  "Mzuzu - Blantyre",
  "Mzuzu - Zomba",
  "Mzuzu - Kasunga",
  "Mzuzu - Karonga",
];

function parseRouteOptions(routesValue: string | undefined) {
  if (!routesValue) return DEFAULT_ROUTE_OPTIONS;

  return routesValue
    .split("\n")
    .map((line) => line.split(":")[0]?.trim())
    .filter((route): route is string => Boolean(route));
}

async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    if (token) headers.set("Authorization", `Bearer ${token}`);

    return fetch(input, { ...init, headers });
  } catch {
    return fetch(input, init);
  }
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

function paymentBadge(status?: string) {
  const label = status || "Pending";
  const colors: Record<string, string> = {
    Pending: "bg-[color:var(--warning)]/10 text-[color:var(--warning)] border-[color:var(--warning)]/20",
    "Payment Confirmed": "bg-primary-100 text-primary-700 border-primary-200",
    Failed: "bg-[color:var(--danger)]/10 text-[color:var(--danger)] border-[color:var(--danger)]/20",
  };
  return <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold border ${colors[label] ?? colors.Pending}`}>{label}</span>;
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
  const [paginationMeta, setPaginationMeta] = useState<{ limit: number; offset: number; count: number } | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<string[]>(DEFAULT_ROUTE_OPTIONS);

  const canSearch = useMemo(() => {
    if (reportType === "tripManifest") return Boolean(filters.tripId?.trim());
    if (reportType === "dailyPassenger") return Boolean(filters.travelDate?.trim());
    if (reportType === "routeReport") return Boolean(filters.destination?.trim());
    return false;
  }, [filters, reportType]);

  const summary = useMemo(() => summarizeReportRows(bookings), [bookings]);
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

        const routes = parseRouteOptions(data?.settings?.routes ?? undefined);
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
        pagination?: { limit: number; offset: number; count: number };
        error?: string;
      };

      if (!res.ok || data.success !== true) {
        throw new Error(data.error || `Unable to load report (${res.status})`);
      }

      setBookings(Array.isArray(data.bookings) ? data.bookings : []);
      setPaginationMeta(data.pagination ?? null);
      setLoadedOnce(true);
    } catch (err) {
      setBookings([]);
      setPaginationMeta(null);
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
  };

  const handleDownloadCsv = () => {
    if (bookings.length === 0) return;
    const csv = createCsvFromBookings(bookings);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `twh-${reportType}-report.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async () => {
    if (bookings.length === 0) return;
    const metadata = {
      "Report Type": REPORT_TYPES.find((item) => item.key === reportType)?.label,
      "Trip ID": filters.tripId || undefined,
      "Travel Date": filters.travelDate || undefined,
      Destination: filters.destination || undefined,
      Pickup: filters.pickup || undefined,
      Status: filters.status || undefined,
      "Payment Status": filters.paymentStatus || undefined,
    };

    try {
      const blob = generatePassengerManifestPdfBlob(
        `${REPORT_TYPES.find((item) => item.key === reportType)?.label ?? "Manifest Report"}`,
        metadata,
        bookings
      );

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `twh-${reportType}-manifest.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF export failed", err);
      setError("Unable to generate PDF. Please try again.");
    }
  };

  const renderReportSummary = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8 gap-3">
      <div className="bg-white rounded-3xl border border-[#d7ebff] p-4">
        <p className="text-xs text-slate-500">Total Trips</p>
        <p className="mt-2 text-2xl font-bold text-primary-900">{summary.totalTrips}</p>
      </div>
      <div className="bg-white rounded-3xl border border-[#d7ebff] p-4">
        <p className="text-xs text-slate-500">Total Passengers</p>
        <p className="mt-2 text-2xl font-bold text-primary-900">{summary.totalPassengers}</p>
      </div>
      <div className="bg-white rounded-3xl border border-[#d7ebff] p-4">
        <p className="text-xs text-slate-500">Total Seats</p>
        <p className="mt-2 text-2xl font-bold text-primary-900">{summary.totalSeats}</p>
      </div>
      <div className="bg-white rounded-3xl border border-[#d7ebff] p-4">
        <p className="text-xs text-slate-500">Confirmed Journeys</p>
        <p className="mt-2 text-2xl font-bold text-primary-900">{summary.confirmedJourneys}</p>
      </div>
      <div className="bg-white rounded-3xl border border-[#d7ebff] p-4">
        <p className="text-xs text-slate-500">Completed Journeys</p>
        <p className="mt-2 text-2xl font-bold text-primary-900">{summary.completedJourneys}</p>
      </div>
      <div className="bg-white rounded-3xl border border-[#d7ebff] p-4">
        <p className="text-xs text-slate-500">Cancelled Journeys</p>
        <p className="mt-2 text-2xl font-bold text-primary-900">{summary.cancelledJourneys}</p>
      </div>
      <div className="bg-white rounded-3xl border border-[#d7ebff] p-4">
        <p className="text-xs text-slate-500">Payment Confirmed</p>
        <p className="mt-2 text-2xl font-bold text-primary-900">{summary.paymentConfirmed}</p>
      </div>
      <div className="bg-white rounded-3xl border border-[#d7ebff] p-4">
        <p className="text-xs text-slate-500">Pending Payments</p>
        <p className="mt-2 text-2xl font-bold text-primary-900">{summary.pendingPayments}</p>
      </div>
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
                    {paymentBadge(row.paymentStatus)}
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
                <th className="px-3 py-3 text-left font-semibold text-slate-600">Payment Status</th>
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
                  <td className="px-3 py-3">{paymentBadge(row.paymentStatus)}</td>
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
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Status</label>
                    <select
                      value={filters.paymentStatus ?? ""}
                      onChange={(event) => setFilters((prev) => ({ ...prev, paymentStatus: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600/50"
                    >
                      <option value="">Any</option>
                      {PAYMENT_STATUS_OPTIONS.map((status) => (
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
                    onClick={handleDownloadPdf}
                    disabled={bookings.length === 0}
                    className="w-full rounded-3xl bg-[#0f3f78] px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-50 hover:bg-[#0a2d56] sm:w-auto"
                  >
                    Download PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    disabled={bookings.length === 0}
                    className="w-full rounded-3xl border border-[#d7ebff] bg-[#eef6ff] px-4 py-3 text-sm font-semibold text-[#101815] transition hover:bg-[#dbeafe] disabled:opacity-50 sm:w-auto"
                  >
                    Export CSV
                  </button>
                </div>
              </div>

              <p className="mt-4 text-sm text-slate-500">
                Use the advanced filter panel to narrow results. Reports are grouped for each selected report type.
              </p>
              <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm text-slate-600">
                  {loadedOnce ? `Showing ${bookings.length} record${bookings.length === 1 ? "" : "s"}${paginationMeta ? ` • page ${pageNumber}` : ""}` : "No results loaded yet"}
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
                    disabled={bookings.length < pageSize || loading}
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
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500">Phone</p>
                    <p className="font-semibold text-slate-900">{selectedRow.phone || "—"}</p>
                    <p className="text-sm text-slate-500">Destination</p>
                    <p className="font-semibold text-slate-900">{selectedRow.destination || "—"}</p>
                    <p className="text-sm text-slate-500">Travel Date</p>
                    <p className="font-semibold text-slate-900">{formatDisplayDate(selectedRow.travelDate)}</p>
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
