"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth";
import type { BookingRecord } from "@/lib/bookingTypes";
import type { JourneyStatus } from "@/lib/bookingUtils";
import { getAllowedJourneyTransitions } from "@/lib/bookingLifecycle";
import { fetchAllUniversities, type ActiveUniversity } from "@/lib/universitiesClient";
import PageHeader from "@/app/components/ui/PageHeader";
import { LoadingState } from "@/app/components/ui/Spinner";
import JourneyStatusBadge, { JOURNEY_STATUS_COLORS } from "@/app/components/ui/JourneyStatusBadge";

const API_BASE = "/api/admin/bookings";

type EnrichedBooking = BookingRecord & { status: JourneyStatus };

export default function AdminTripsPage() {
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [universities, setUniversities] = useState<ActiveUniversity[]>([]);
  const [maxSeats, setMaxSeats] = useState("15");
  const [isViewer, setIsViewer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [universityFilter, setUniversityFilter] = useState("all");
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);

  const refreshBookings = async () => {
    try {
      const res = await authFetch(API_BASE, { method: "GET", cache: "no-store" });
      if (!res.ok) return;
      const data: unknown = await res.json();
      const list = (data as { bookings?: unknown } | null | undefined)?.bookings;
      const source: BookingRecord[] = Array.isArray(list) ? (list as BookingRecord[]) : [];
      setBookings(
        source.map((b) => ({
          ...b,
          status: typeof b.status === "string" && b.status.trim() ? (b.status as JourneyStatus) : "Booked",
        }))
      );
    } catch (error) {
      console.error("Failed to refresh bookings:", error);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(async () => {
      try {
        const [profileRes, settingsRes, universitiesData] = await Promise.all([
          authFetch("/api/profile"),
          authFetch("/api/settings"),
          fetchAllUniversities(),
        ]);
        if (profileRes.ok) {
          const data: unknown = await profileRes.json();
          const role = (data as { profile?: { role?: string } } | null | undefined)?.profile?.role;
          setIsViewer(role === "viewer");
        }
        if (settingsRes.ok) {
          const data: unknown = await settingsRes.json();
          const payload = (data as { settings?: Record<string, unknown> } | null | undefined)?.settings;
          if (payload) setMaxSeats(String(payload.max_seats ?? payload.maxSeats ?? "15"));
        }
        setUniversities(universitiesData);
        await refreshBookings();
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  // Live operational view, same 15s refresh cadence as the admin dashboard
  // this was extracted from.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshBookings();
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, []);

  const universityById = useMemo(() => {
    const map = new Map<string, ActiveUniversity>();
    for (const u of universities) map.set(u.id, u);
    return map;
  }, [universities]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (universityFilter !== "all" && b.universityId !== universityFilter) return false;
      if (!q) return true;
      return (
        String(b.name || "").toLowerCase().includes(q) ||
        String(b.phone || "").toLowerCase().includes(q) ||
        String(b.tripId || "").toLowerCase().includes(q) ||
        String(b.destination || "").toLowerCase().includes(q)
      );
    });
  }, [bookings, search, universityFilter]);

  const tripGroups = useMemo(() => {
    const acc: Record<string, EnrichedBooking[]> = {};
    for (const item of filtered) {
      const tripId = String(item.tripId || "").trim();
      if (!tripId) continue;
      if (!acc[tripId]) acc[tripId] = [];
      acc[tripId].push(item);
    }
    return acc;
  }, [filtered]);

  const updateStatus = async (tripId: string, status: JourneyStatus) => {
    const cancellationReason =
      status === "Cancelled" ? prompt("Enter the cancellation reason (this will be shared with the customer):")?.trim() : undefined;
    if (status === "Cancelled" && (!cancellationReason || cancellationReason.length < 5)) {
      if (cancellationReason !== undefined) alert("Please provide a cancellation reason of at least 5 characters.");
      return;
    }

    try {
      setStatusUpdating(tripId);
      const res = await authFetch(API_BASE, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, status, cancellationReason }),
      });
      const result = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || result?.success !== true) {
        alert(result?.error || `Failed to update status (HTTP ${res.status})`);
      }
      await refreshBookings();
    } catch (error) {
      console.error("Error updating status:", error);
      alert("Network error updating status");
      await refreshBookings();
    } finally {
      setStatusUpdating(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trips"
        title="Active Trips"
        description="Live seat fill and journey status for every trip with at least one booking."
        actions={
          <div className="flex gap-2 items-center">
            <div className="relative w-full sm:w-64">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">🔎</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search trips..."
                className="w-full pl-9 pr-3 py-2 border border-[#d7ebff] rounded-xl text-sm bg-[#eef6ff] text-[#101815] placeholder:text-[#64748b] focus:outline-none focus:ring-4 focus:ring-[#0f3f78]/20 focus:border-[#0f3f78]"
              />
            </div>
            {universities.length > 0 && (
              <select
                value={universityFilter}
                onChange={(e) => setUniversityFilter(e.target.value)}
                className="rounded-xl border border-[#d7ebff] bg-[#eef6ff] px-3 py-2 text-sm text-[#101815] focus:outline-none focus:ring-4 focus:ring-[#0f3f78]/20 focus:border-[#0f3f78]"
              >
                <option value="all">All campuses</option>
                {universities.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        }
      />

      {loading ? (
        <LoadingState label="Loading trips…" />
      ) : Object.keys(tripGroups).length === 0 ? (
        <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-8 text-center">
          <p className="text-slate-700 font-semibold text-lg">No trips found</p>
          <p className="text-sm text-slate-500 mt-1">Create a booking to generate a trip.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
          {Object.entries(tripGroups).map(([tripId, passengers]) => {
            const dest = passengers[0]?.destination || "—";
            const date = passengers[0]?.travelDate || "—";
            const status = passengers[0]?.status || "Pending";
            const universityId = passengers[0]?.universityId;
            const campusName = universityId ? universityById.get(universityId)?.name : undefined;
            const totalSeats = passengers.reduce((s, p) => s + (p.seats || 1), 0);
            const capacity = parseInt(maxSeats) || 15;
            const fillPercent = Math.min(100, Math.round((totalSeats / capacity) * 100));
            const isUpdating = statusUpdating === tripId;

            return (
              <div
                key={tripId}
                className="rounded-2xl border border-[#d7ebff] bg-[#eef6ff] p-4 shadow-sm transition hover:border-[#0f3f78]/30 hover:shadow-lg sm:p-5"
              >
                <div className="flex justify-between items-start mb-3 gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-extrabold text-primary-900 text-sm sm:text-base truncate break-words-force">{tripId}</h3>
                    <p className="text-[11px] text-slate-500 mt-1 break-words-force">📍 {dest}</p>
                    {campusName && <p className="text-[11px] text-slate-400">🎓 {campusName}</p>}
                    <p className="text-[11px] text-slate-400">📅 {date}</p>
                  </div>
                  <JourneyStatusBadge status={status} />
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs text-slate-600 mb-1">
                    <span>Seats</span>
                    <span className="font-semibold">
                      {totalSeats} / {capacity}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${
                        fillPercent >= 100 ? "bg-red-500" : fillPercent >= 80 ? "bg-orange-500" : "bg-[#006B3F]"
                      }`}
                      style={{ width: `${fillPercent}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{fillPercent}% filled</p>
                </div>

                <p className="text-xs text-slate-500 mb-3">
                  👥 {passengers.length} passenger{passengers.length === 1 ? "" : "s"}
                </p>

                <div className="grid grid-cols-2 gap-1.5 mb-3">
                  {getAllowedJourneyTransitions(status).map((statusValue) => {
                    if (isViewer) return null;
                    const label = statusValue === "Cancelled" ? "Cancel" : statusValue;
                    return (
                      <button
                        key={statusValue}
                        onClick={() => void updateStatus(tripId, statusValue)}
                        disabled={isUpdating}
                        className={`${(JOURNEY_STATUS_COLORS[statusValue] || JOURNEY_STATUS_COLORS.Confirmed).button} rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white transition disabled:opacity-50`}
                      >
                        {isUpdating ? "..." : label}
                      </button>
                    );
                  })}
                </div>

                <details className="text-xs">
                  <summary className="cursor-pointer font-semibold text-accent-600 hover:text-accent-700">
                    View Passengers ({passengers.length})
                  </summary>
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {passengers.map((p, i) => (
                      <div key={i} className="flex justify-between items-center py-1 border-b border-[#d7ebff] last:border-0">
                        <span className="text-slate-700 break-words-force">{p.name || "—"}</span>
                        <span className="text-slate-400">
                          {p.seats || 1} seat{p.seats !== 1 ? "s" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
