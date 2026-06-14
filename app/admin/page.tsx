"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type BookingStatus =
  | "Pending"
  | "Confirmed"
  | "Boarding"
  | "Departed"
  | "Arrived"
  | "Completed"
  | "Cancelled"
  | string;

type BookingRecord = {
  tripId?: string;
  destination?: string;
  status?: BookingStatus;
  name?: string;
  studentId?: string;
  phone?: string;
  bookingId?: string;
  travelDate?: string;
  pickup?: string;
  location?: string;
  seats?: number;
  bookingType?: string;
  timestamp?: unknown;
};

type EnrichedBooking = BookingRecord & {
  status: BookingStatus;
};

type TripGroup = Record<string, EnrichedBooking[]>;

const API_URL = "https://script.google.com/macros/s/AKfycby17HHcmR3G_8GhP7wdb3pvkcZpnAy6R0mtH8W7qrkcRuu5JiEQy4FIRkEDQ81KFk_L/exec";

function getStatus(raw: unknown): BookingStatus {
  if (typeof raw === "string" && raw.trim()) return raw;
  return "Pending";
}

function formatCurrentDate(date: Date): string {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const weekday = weekdays[date.getDay()];
  const day = String(date.getDate()).padStart(2, "0");
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${weekday}, ${month} ${day}, ${year}`;
}

const statusColors: Record<string, { badge: string; button: string }> = {
  Pending: { badge: "bg-yellow-50 text-yellow-700 border-yellow-200", button: "bg-yellow-600 hover:bg-yellow-700" },
  Confirmed: { badge: "bg-green-50 text-green-700 border-green-200", button: "bg-green-600 hover:bg-green-700" },
  Boarding: { badge: "bg-blue-50 text-blue-700 border-blue-200", button: "bg-blue-600 hover:bg-blue-700" },
  Departed: { badge: "bg-purple-50 text-purple-700 border-purple-200", button: "bg-purple-600 hover:bg-purple-700" },
  Arrived: { badge: "bg-indigo-50 text-indigo-700 border-indigo-200", button: "bg-indigo-600 hover:bg-indigo-700" },
  Completed: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", button: "bg-emerald-600 hover:bg-emerald-700" },
  Cancelled: { badge: "bg-red-50 text-red-700 border-red-200", button: "bg-red-600 hover:bg-red-700" },
};

export default function AdminPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);

  const refreshBookings = async () => {
    try {
      const res = await fetch(API_URL);
      const data: unknown = await res.json();

      const maybeObj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
      const maybeBookings = maybeObj && Array.isArray(maybeObj.bookings)
        ? (maybeObj.bookings as unknown[])
        : [];

      const source: BookingRecord[] = Array.isArray(maybeBookings)
        ? (maybeBookings as BookingRecord[])
        : [];

      const enriched: EnrichedBooking[] = source.map((b) => ({
        ...b,
        status: getStatus(b.status),
      }));

      setBookings(enriched);
    } catch (error) {
      console.error("Failed to refresh bookings:", error);
    }
  };

  useEffect(() => {
    const auth = (() => {
      try {
        return localStorage.getItem("auth");
      } catch {
        return null;
      }
    })();

    if (!auth) {
      router.push("/login");
      return;
    }

    const run = async () => {
      try {
        setLoading(true);
        await refreshBookings();
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [router]);

  useEffect(() => {
    const id = setInterval(() => {
      void refreshBookings();
    }, 15000);

    return () => clearInterval(id);
  }, []);

  const handleLogout = () => {
    try {
      localStorage.removeItem("auth");
    } catch {
      // ignore
    }
    router.push("/login");
  };

  const updateStatus = async (tripId: string, status: BookingStatus) => {
    try {
      setStatusUpdating(tripId);

      const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "updateStatus",
          tripId,
          status,
        }),
      });

      let result: unknown = null;
      try {
        result = await res.json();
      } catch (err) {
        // If response is not JSON, treat as failure
        console.error("Non-JSON response from updateStatus", err);
        alert("Failed to update status: non-JSON response from server.");
        await refreshBookings();
        return;
      }
      const ok =
        (result as Record<string, unknown>).success === true;

      if (!ok) {
        const err =
          result && typeof result === "object"
            ? (result as Record<string, unknown>).error
            : null;

        alert(typeof err === "string" ? err : "Failed to update status");
      }

      await refreshBookings();
    } catch (error) {
      console.error("Error updating status:", error);
      await refreshBookings();
    } finally {
      setStatusUpdating(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;

    return bookings.filter((b) => {
      const name = String(b.name ?? "").toLowerCase();
      const studentId = String(b.studentId ?? "").toLowerCase();
      const destination = String(b.destination ?? "").toLowerCase();
      const tripId = String(b.tripId ?? "").toLowerCase();
      const bookingId = String(b.bookingId ?? "").toLowerCase();

      return (
        name.includes(q) ||
        studentId.includes(q) ||
        destination.includes(q) ||
        tripId.includes(q) ||
        bookingId.includes(q)
      );
    });
  }, [bookings, search]);

  const grouped: TripGroup = useMemo(() => {
    const acc: TripGroup = {};

    for (const item of filtered) {
      const key = (item.tripId?.trim() || "NO-TRIP").toString();
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
    }

    return acc;
  }, [filtered]);

  const selectedData = useMemo(() => {
    return selectedTrip ? grouped[selectedTrip] ?? null : null;
  }, [grouped, selectedTrip]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    return filtered;
  }, [filtered, search]);

  const stats = useMemo(() => {
    const allTrips = Object.keys(grouped).length;
    const totalBookings = bookings.length;

    const pendingTrips = Object.values(grouped).filter(
      (group) => group[0]?.status === "Pending"
    ).length;

    const confirmedTrips = Object.values(grouped).filter(
      (group) => group[0]?.status === "Confirmed"
    ).length;

    const cancelledTrips = Object.values(grouped).filter(
      (group) => group[0]?.status === "Cancelled"
    ).length;

    return { allTrips, totalBookings, pendingTrips, confirmedTrips, cancelledTrips };
  }, [bookings.length, grouped]);

  const statusBadge = (status: BookingStatus) => {
    const s = String(status || "Pending");
    const colors = statusColors[s] || statusColors.Pending;

    return (
      <span
        className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold ${colors.badge}`}
      >
        {s}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="hidden md:block">
        <div className="h-6" />
      </div>

      <div className="min-h-screen flex">
        <aside className="w-72 bg-blue-950 text-white p-6 hidden lg:block">
          <div className="flex items-center gap-3 mb-10">
            <Image
              src="/logo.png"
              width={40}
              height={40}
              className="rounded-full object-cover"
              alt="Travel with Hawkins"
            />
            <div>
              <h1 className="text-sm font-bold leading-tight">Travel with Hawkins</h1>
              <p className="text-xs opacity-70">Transport Operations</p>
            </div>
          </div>

          <nav className="space-y-2 text-sm">
            <div className="px-3 py-2 rounded-lg bg-blue-900/40 border border-blue-200/20">
              <p className="font-semibold">Dashboard</p>
            </div>
            <p className="opacity-70 px-3 py-2 rounded-lg hover:bg-blue-900/30 cursor-pointer transition">Trips</p>
            <p className="opacity-70 px-3 py-2 rounded-lg hover:bg-blue-900/30 cursor-pointer transition">Bookings</p>
            <p className="opacity-70 px-3 py-2 rounded-lg hover:bg-blue-900/30 cursor-pointer transition">Students</p>
            <p className="opacity-70 px-3 py-2 rounded-lg hover:bg-blue-900/30 cursor-pointer transition">Settings</p>
          </nav>
        </aside>

        <main className="flex-1 p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-blue-950">Admin Dashboard</h2>
              <p className="text-sm text-slate-500 mt-1">Manage trips, bookings and students</p>
              <p className="text-xs text-slate-400 mt-1" aria-hidden>
                {formatCurrentDate(new Date())}
              </p>
            </div>

            <div className="flex gap-2 w-full lg:w-auto flex-wrap items-end">
              <div className="w-full sm:w-72">
                <label htmlFor="search" className="block text-xs font-semibold text-slate-600 mb-1">
                  Search
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                    🔎
                  </span>
                  <input
                    id="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search bookings by name, ID, destination..."
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-300"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  void (async () => {
                    setLoading(true);
                    try {
                      await refreshBookings();
                    } finally {
                      setLoading(false);
                    }
                  })();
                }}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition"
              >
                Refresh
              </button>

              <button
                onClick={handleLogout}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition"
              >
                Logout
              </button>
            </div>
          </div>

          {!loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition">
                <p className="text-sm text-slate-500">Total Trips</p>
                <h3 className="text-3xl font-extrabold text-blue-950 mt-2">{stats.allTrips}</h3>
              </div>
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition">
                <p className="text-sm text-slate-500">Total Bookings</p>
                <h3 className="text-3xl font-extrabold text-blue-950 mt-2">{stats.totalBookings}</h3>
              </div>
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition">
                <p className="text-sm text-slate-500">Pending Trips</p>
                <h3 className="text-3xl font-extrabold text-yellow-600 mt-2">{stats.pendingTrips}</h3>
              </div>
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition">
                <p className="text-sm text-slate-500">Confirmed Trips</p>
                <h3 className="text-3xl font-extrabold text-green-700 mt-2">{stats.confirmedTrips}</h3>
              </div>
              <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition">
                <p className="text-sm text-slate-500">Cancelled Trips</p>
                <h3 className="text-3xl font-extrabold text-red-700 mt-2">{stats.cancelledTrips}</h3>
              </div>
            </div>
          )}

          {loading ? (
            <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-8">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-blue-500 animate-pulse"></div>
                <p className="text-slate-600 font-medium">Loading trips...</p>
              </div>
            </div>
          ) : (
            <>
              {search.trim() ? (
                <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-6 mb-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-blue-950">Search results</h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Showing {searchResults.length} booking{searchResults.length === 1 ? "" : "s"} for “{search.trim()}”.
                      </p>
                    </div>
                    <button
                      onClick={() => setSearch("")}
                      className="text-sm text-slate-600 hover:text-slate-900 font-semibold"
                    >
                      Clear search
                    </button>
                  </div>
                </div>
              ) : null}

              {Object.keys(grouped).length === 0 ? (
                <div className="sm:col-span-2 xl:col-span-3 bg-white border border-slate-100 rounded-xl shadow-sm p-8 text-center">
                  <p className="text-slate-700 font-semibold text-lg">No bookings found</p>
                  <p className="text-sm text-slate-500 mt-1">Try refreshing or adjusting the search.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                  {Object.keys(grouped).map((tripId) => {
                    const tripData = grouped[tripId];
                    const status = tripData[0]?.status || "Pending";
                    const destination = tripData[0]?.destination || "—";
                    const passengerCount = tripData.length;
                    const isUpdating = statusUpdating === tripId;

                    return (
                      <div
                        key={tripId}
                        onClick={() => setSelectedTrip(tripId)}
                        className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-lg hover:border-blue-200 transition cursor-pointer"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") setSelectedTrip(tripId);
                        }}
                        aria-label={`Open trip details for ${tripId}`}
                      >
                        <div className="flex justify-between items-start mb-4 gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-extrabold text-blue-950 text-lg truncate">{tripId}</h3>
                            <p className="text-xs text-slate-500 mt-2 truncate">📍 {destination}</p>
                            <p className="text-xs text-slate-400 mt-1 truncate">👥 {passengerCount} passenger{passengerCount === 1 ? "" : "s"}</p>
                          </div>
                          {statusBadge(status)}
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void updateStatus(tripId, "Confirmed");
                            }}
                            disabled={isUpdating}
                            className={`${statusColors.Confirmed.button} text-white text-xs py-2 rounded-lg font-semibold shadow-sm disabled:opacity-50 transition`}
                          >
                            {isUpdating ? "..." : "Confirm"}
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void updateStatus(tripId, "Boarding");
                            }}
                            disabled={isUpdating}
                            className={`${statusColors.Boarding.button} text-white text-xs py-2 rounded-lg font-semibold shadow-sm disabled:opacity-50 transition`}
                          >
                            {isUpdating ? "..." : "Boarding"}
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void updateStatus(tripId, "Departed");
                            }}
                            disabled={isUpdating}
                            className={`${statusColors.Departed.button} text-white text-xs py-2 rounded-lg font-semibold shadow-sm disabled:opacity-50 transition`}
                          >
                            {isUpdating ? "..." : "Departed"}
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void updateStatus(tripId, "Cancelled");
                            }}
                            disabled={isUpdating}
                            className={`${statusColors.Cancelled.button} text-white text-xs py-2 rounded-lg font-semibold shadow-sm disabled:opacity-50 transition`}
                          >
                            {isUpdating ? "..." : "Cancel"}
                          </button>
                        </div>

                        <button
                          onClick={() => setSelectedTrip(tripId)}
                          className="w-full text-blue-600 hover:text-blue-800 text-xs font-semibold py-2 transition"
                        >
                          View Details →
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {selectedData && selectedTrip && (
            <div
              className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-9999"
              role="dialog"
              aria-modal="true"
              aria-label="Trip detail modal"
              onMouseDown={(e) => {
                if (e.currentTarget === e.target) setSelectedTrip(null);
              }}
            >
              <div className="bg-white w-full max-w-3xl rounded-2xl p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6 gap-3 sticky top-0 bg-white pb-4 border-b border-slate-200">
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-blue-950 text-xl">Trip Details</h3>
                    <p className="text-sm text-slate-500 mt-1 truncate">Trip ID: {selectedTrip}</p>
                  </div>

                  <button
                    onClick={() => setSelectedTrip(null)}
                    className="text-slate-600 hover:text-slate-900 text-2xl leading-none px-2 py-1 rounded hover:bg-slate-100 transition"
                    aria-label="Close trip modal"
                    type="button"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-slate-600 mb-1">Passengers</p>
                      <p className="font-bold text-lg text-blue-950">{selectedData.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 mb-1">Destination</p>
                      <p className="font-semibold text-slate-800 truncate">{selectedData[0]?.destination || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 mb-1">Status</p>
                      {statusBadge(selectedData[0]?.status || "Pending")}
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 mb-1">Travel Date</p>
                      <p className="font-semibold text-slate-800 text-sm">{selectedData[0]?.travelDate || "—"}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-bold text-slate-900 mb-3">Passengers</h4>
                  {selectedData.map((s, i) => {
                    const studentName = s.name ?? "—";
                    const phone = s.phone ?? "—";

                    return (
                      <div
                        key={`${selectedTrip}-${i}`}
                        className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-blue-950 text-sm truncate">{studentName}</p>
                            <p className="text-xs text-slate-500 mt-1 truncate">ID: {s.studentId || "—"}</p>
                            <p className="text-xs text-slate-500 truncate">📱 {phone}</p>
                          </div>

                          <div className="text-right">
                            <p className="text-xs font-semibold text-slate-600">Seats: {s.seats || 1}</p>
                            <p className="text-xs text-slate-500 mt-1">Booking: {s.bookingId || "—"}</p>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <p className="text-xs text-slate-500">Type: <span className="font-semibold">{s.bookingType || "Standard"}</span></p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

