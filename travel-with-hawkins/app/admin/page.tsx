"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

// ================= TYPES =================
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
  timestamp?: unknown;
  name?: string;
  studentId?: string;
  phone?: string;
  destination?: string;
  travelDate?: string;
  seats?: number;
  pickup?: string;
  location?: string;
  bookingId?: string;
  status?: BookingStatus;
  tripId?: string;
  bookingType?: string;
};

type EnrichedBooking = BookingRecord & {
  status: BookingStatus;
};

type TabName = "overview" | "trips" | "bookings" | "students" | "whatsapp" | "settings";

// ================= PRICING HELPERS =================
function parseRoutePrices(routesStr: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of routesStr.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(":");
    if (parts.length === 2) {
      const route = parts[0].trim();
      const price = parseInt(parts[1].trim());
      if (route && !isNaN(price)) map.set(route, price);
    }
  }
  return map;
}

function getRoutePrice(destination: string | undefined, routesStr: string, fallback = 5000): number {
  if (!destination) return fallback;
  const priceMap = parseRoutePrices(routesStr);
  return priceMap.get(destination.trim()) ?? fallback;
}

function getBookingFee(settingsBookingFee: string): number {
  // bookingFee is a flat amount per confirmed booking
  // (previously this was added per row, which can double-count if duplicate rows exist)
  return parseInt(settingsBookingFee) || 0;
}


function calcBookingRevenue(
  b: { destination?: string; seats?: number; status?: string },
  routesStr: string,
  bookingFeeStr: string
): { ticketRevenue: number; bookingFee: number; total: number } {
  const ticketPrice = getRoutePrice(b.destination, routesStr);
  const seats = b.seats || 1;

  // Only count booking fee once the booking is paid/confirmed.
  // This matches what the UI label says: "paid when Confirmed/✓ Pay".
  const isConfirmed = String(b.status || "Pending") === "Confirmed";
  const fee = isConfirmed ? getBookingFee(bookingFeeStr) : 0;

  return {
    ticketRevenue: seats * ticketPrice,
    bookingFee: fee,
    total: seats * ticketPrice + fee,
  };
}


type FairRatesEditorProps = {
  routesStr: string;
  onChange: (next: string) => void;
};

function FairRatesEditor({ routesStr, onChange }: FairRatesEditorProps) {
  const priceMap = useMemo(() => parseRoutePrices(routesStr), [routesStr]);
  const destinations = useMemo(
    () => Array.from(priceMap.keys()).sort((a, b) => a.localeCompare(b)),
    [priceMap]
  );

  const [selected, setSelected] = useState<string>(destinations[0] || "");
  const [fairValue, setFairValue] = useState<string>("0");

  // Keep fairValue in sync WITHOUT useEffect/setState inside effects
  // (this repo’s eslint forbids it).
  // computedFair is kept for previous logic but not currently used.
  // Keeping it removed avoids lint errors.

  const save = () => {
    const nextFair = parseInt(fairValue, 10);
    if (!selected || isNaN(nextFair) || nextFair < 0) return;

    const updated = new Map(priceMap);
    updated.set(selected, nextFair);

    const lines = Array.from(updated.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dest, fair]) => `${dest}: ${fair}`);

    onChange(lines.join("\n"));
  };

  const addNew = () => {
    const newDest = prompt(
      "Enter destination/route exactly as it appears in booking destination (e.g. 'Mzuzu → Lilongwe'):"
    );
    if (!newDest) return;
    const trimmed = newDest.trim();
    if (!trimmed) return;

    const nextFair = parseInt(fairValue, 10);
    const v = isNaN(nextFair) ? 0 : nextFair;

    const updated = new Map(priceMap);
    updated.set(trimmed, v);

    const lines = Array.from(updated.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dest, fair]) => `${dest}: ${fair}`);

    setSelected(trimmed);
    onChange(lines.join("\n"));
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Route/Destination</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full border border-gray-300 p-2.5 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8650A]"
          >
            {destinations.length === 0 ? (
              <option value="">No routes found</option>
            ) : (
              destinations.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Fair (per seat) (MWK)</label>
          <input
            type="number"
            inputMode="numeric"
            value={fairValue}
            onChange={(e) => setFairValue(e.target.value)}
            className="w-full border border-gray-300 p-2.5 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8650A]"
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={save}
          disabled={!selected}
          className="bg-[#1a0f00] hover:bg-[#3a2010] disabled:opacity-50 text-white px-4 py-2 rounded-lg font-semibold shadow-sm transition text-sm"
        >
          ✓ Set Fair
        </button>
        <button
          onClick={addNew}
          className="bg-white hover:bg-[#fff8f2] border border-slate-200 text-slate-800 px-4 py-2 rounded-lg font-semibold shadow-sm transition text-sm"
        >
          ＋ Add route
        </button>
      </div>

      <p className="text-[12px] text-slate-500">
        The editor updates the same underlying <span className="font-mono">routes</span> config. Default format supported:
        <span className="block font-mono mt-1">Destination: Fair</span>
      </p>
    </div>
  );
}

// ================= CONSTANTS =================
const API_URL = "https://script.google.com/macros/s/AKfycby17HHcmR3G_8GhP7wdb3pvkcZpnAy6R0mtH8W7qrkcRuu5JiEQy4FIRkEDQ81KFk_L/exec";
const GATEWAY_TOKEN = "HAWKINS_SECURE_GATEWAY_2026";

const TABS: { key: TabName; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "" },
  { key: "trips", label: "Trips", icon: "" },
  { key: "bookings", label: "Bookings", icon: "" },
  { key: "students", label: "Students CRM", icon: "" },
  { key: "whatsapp", label: "WhatsApp Broadcast", icon: "" },
  { key: "settings", label: "Settings", icon: "" },
];

const STATUS_COLORS: Record<string, { badge: string; button: string }> = {
  Pending: { badge: "bg-yellow-50 text-yellow-700 border-yellow-200", button: "bg-yellow-600 hover:bg-yellow-700" },
  Confirmed: { badge: "bg-[#E8650A]/10 text-[#E8650A] border-[#006B3F]/30", button: "bg-[#E8650A] hover:bg-[#c94f00]" },
  Boarding: { badge: "bg-orange-50 text-[#c94f00] border-orange-200", button: "bg-[#E8650A] hover:bg-[#c94f00]" },
  Departed: { badge: "bg-purple-50 text-purple-700 border-purple-200", button: "bg-purple-600 hover:bg-purple-700" },
  Arrived: { badge: "bg-indigo-50 text-indigo-700 border-indigo-200", button: "bg-indigo-600 hover:bg-indigo-700" },
  Completed: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", button: "bg-emerald-600 hover:bg-emerald-700" },
  Cancelled: { badge: "bg-red-50 text-red-700 border-red-200", button: "bg-red-600 hover:bg-red-700" },
};

function getStatus(raw: unknown): BookingStatus {
  if (typeof raw === "string" && raw.trim()) return raw;
  return "Pending";
}

function formatDate(date: Date): string {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${weekdays[date.getDay()]}, ${months[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")}, ${date.getFullYear()}`;
}

function StatusBadge({ status }: { status: BookingStatus }) {
  const s = String(status || "Pending");
  const c = STATUS_COLORS[s] || STATUS_COLORS.Pending;
  return (
    <span className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold ${c.badge}`}>
      {s}
    </span>
  );
}

// ================= MAIN ADMIN PAGE =================
export default function AdminPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [activeTab, setActiveTab] = useState<TabName>("overview");
  const [search, setSearch] = useState("");
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const defaultSettings = useMemo(
    () => ({
      ticketFee: "5000",
      bookingFee: "2000",
      maxSeats: "15",
      secretPassword: "1234",
      routes:
        "Mzuzu → Lilongwe: 5000\nMzuzu → Blantyre: 8000\nMzuzu → Zomba: 7000\nMzuzu → Kasungu: 3000\nMzuzu → Karonga: 6000",
    }),
    []
  );

  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("twh_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaultSettings, ...parsed };
      }
    } catch {
      // ignore
    }
    return defaultSettings;
  });

  const [settingsMsg, setSettingsMsg] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [whatsappMsg, setWhatsappMsg] = useState("");
  const [whatsappCopied, setWhatsappCopied] = useState(false);

  const refreshBookings = useCallback(async () => {
    try {
      // Use POST to avoid browser CORS restrictions on Apps Script doGet.
      const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "getAllData" }),
      });
      const data: unknown = await res.json();
      const maybeObj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
      const maybeBookings = maybeObj && Array.isArray(maybeObj.bookings) ? (maybeObj.bookings as unknown[]) : [];
      const source: BookingRecord[] = Array.isArray(maybeBookings) ? (maybeBookings as BookingRecord[]) : [];
      const enriched: EnrichedBooking[] = source.map((b) => ({ ...b, status: getStatus(b.status) }));
      setBookings(enriched);
    } catch (error) {
      console.error("Failed to refresh bookings:", error);
    }
  }, []);


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
  }, [router, refreshBookings]);

  useEffect(() => {
    const id = setInterval(() => void refreshBookings(), 15000);
    return () => clearInterval(id);
  }, [refreshBookings]);

  const handleLogout = () => {
    try {
      localStorage.removeItem("auth");
    } catch {
      // ignore
    }
    router.push("/login");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) => {
      const fields = [b.name, b.studentId, b.destination, b.tripId, b.bookingId, b.phone].map((f) => String(f ?? "").toLowerCase());
      return fields.some((f) => f.includes(q));
    });
  }, [bookings, search]);

  const overviewStats = useMemo(() => {
    const total = bookings.length;
    const pending = bookings.filter((b) => b.status === "Pending").length;
    const confirmed = bookings.filter((b) => b.status === "Confirmed").length;
    const completed = bookings.filter((b) => b.status === "Completed" || b.status === "Arrived").length;
    const cancelled = bookings.filter((b) => b.status === "Cancelled").length;

    let totalTicketRevenue = 0;
    let totalBookingFees = 0;
    let pendingTicketRevenue = 0;
    let pendingBookingFees = 0;
    let confirmedTicketRevenue = 0;
    let confirmedBookingFees = 0;

    const routeRevenueBreakdown: Record<string, { tickets: number; fees: number; total: number; count: number }> = {};

    for (const b of bookings) {
      const rev = calcBookingRevenue(b, settings.routes, settings.bookingFee);
      const dest = b.destination?.trim() || "Unknown";

      if (!routeRevenueBreakdown[dest]) {
        routeRevenueBreakdown[dest] = { tickets: 0, fees: 0, total: 0, count: 0 };
      }

      routeRevenueBreakdown[dest].tickets += rev.ticketRevenue;
      routeRevenueBreakdown[dest].fees += rev.bookingFee;
      routeRevenueBreakdown[dest].total += rev.total;
      routeRevenueBreakdown[dest].count += 1;

      totalTicketRevenue += rev.ticketRevenue;
      totalBookingFees += rev.bookingFee;

      if (b.status === "Pending") {
        pendingTicketRevenue += rev.ticketRevenue;
        pendingBookingFees += rev.bookingFee;
      } else if (b.status === "Confirmed") {
        confirmedTicketRevenue += rev.ticketRevenue;
        confirmedBookingFees += rev.bookingFee;
      }
    }

    const totalRevenue = totalTicketRevenue + totalBookingFees;

    const pendingRevenue = pendingTicketRevenue + pendingBookingFees;
    const confirmedRevenue = confirmedTicketRevenue + confirmedBookingFees;

    const totalSeats = bookings.reduce((sum, b) => sum + (b.seats || 1), 0);
    const uniqueTrips = new Set(bookings.map((b) => b.tripId).filter(Boolean)).size;
    const uniqueStudents = new Set(bookings.map((b) => b.studentId).filter(Boolean)).size;

    const activeDispatches = bookings.filter((b) => b.status === "Boarding" || b.status === "Departed").length;

    return {
      total,
      pending,
      confirmed,
      completed,
      cancelled,
      totalRevenue,
      totalTicketRevenue,
      totalBookingFees,
      pendingRevenue,
      pendingTicketRevenue,
      pendingBookingFees,
      confirmedRevenue,
      confirmedTicketRevenue,
      confirmedBookingFees,
      totalSeats,
      uniqueTrips,
      uniqueStudents,
      activeDispatches,
      routeRevenueBreakdown,
    };
  }, [bookings, settings.routes, settings.bookingFee]);

  const tripGroups = useMemo(() => {
    const acc: Record<string, EnrichedBooking[]> = {};
    for (const item of filtered) {
      const key = (item.tripId?.trim() || "NO-TRIP").toString();
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
    }
    return acc;
  }, [filtered]);

  const studentGroups = useMemo(() => {
    const acc: Record<
      string,
      { studentId: string; name: string; phone: string; bookings: EnrichedBooking[]; totalSeats: number; totalSpent: number }
    > = {};

    for (const b of bookings) {
      const rev = calcBookingRevenue(b, settings.routes, settings.bookingFee);
      const sid = String(b.studentId ?? "UNKNOWN").trim();

      if (!acc[sid]) {
        acc[sid] = {
          studentId: sid,
          name: b.name || "—",
          phone: b.phone || "—",
          bookings: [],
          totalSeats: 0,
          totalSpent: 0,
        };
      }

      acc[sid].bookings.push(b);
      acc[sid].totalSeats += b.seats || 1;
      acc[sid].totalSpent += rev.total;

      if (!acc[sid].name || acc[sid].name === "—") acc[sid].name = b.name || "—";
    }

    return Object.values(acc).sort((a, b) => b.bookings.length - a.bookings.length);
  }, [bookings, settings.routes, settings.bookingFee]);

  const updateStatus = async (targetId: string, status: BookingStatus, byTrip = true) => {
    try {
      setStatusUpdating(targetId);
      const body: Record<string, unknown> = {
        action: "updateStatus",
        status,
        token: GATEWAY_TOKEN,
      };
      if (byTrip) body.tripId = targetId;
      else body.bookingId = targetId;

      const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(body) });
      const result = await res.json();

      if (!result?.success) {
        alert(result?.error || "Failed to update status");
      }

      await refreshBookings();
    } catch (error) {
      console.error("Error updating status:", error);
      await refreshBookings();
    } finally {
      setStatusUpdating(null);
    }
  };

  const deleteBooking = async (bookingId: string) => {
    if (!confirm(`Are you sure you want to delete booking ${bookingId}?`)) return;
    try {
      setDeleting(bookingId);
      const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "deleteBooking", bookingId, token: GATEWAY_TOKEN }),
      });
      const result = await res.json();

      if (!result?.success) {
        alert(result?.error || "Failed to delete booking");
      }

      await refreshBookings();
    } catch (error) {
      console.error("Error deleting booking:", error);
      await refreshBookings();
    } finally {
      setDeleting(null);
    }
  };

  const generateWhatsAppMessage = () => {
    if (Object.keys(tripGroups).length === 0) {
      setWhatsappMsg("No active trips to broadcast.");
      return;
    }

    const parts: string[] = [];
    parts.push("🚐 *TRAVEL WITH HAWKINS — ACTIVE TRIPS* 🚐\n");
    parts.push("📅 " + formatDate(new Date()) + "\n");

    for (const [tripId, passengers] of Object.entries(tripGroups)) {
      const dest = passengers[0]?.destination || "—";
      const date = passengers[0]?.travelDate || "—";
      const status = passengers[0]?.status || "Pending";
      const totalSeats = passengers.reduce((s, p) => s + (p.seats || 1), 0);
      const maxSeats = parseInt(settings.maxSeats) || 15;
      const remaining = maxSeats - totalSeats;

      parts.push(`\n━━━━━━━━━━━━━━━━━`);
      parts.push(`🚍 *Trip:* ${tripId}`);
      parts.push(`📍 *Destination:* ${dest}`);
      parts.push(`📆 *Date:* ${date}`);
      parts.push(`📊 *Status:* ${status}`);
      parts.push(`👥 *Passengers:* ${passengers.length} | *Seats:* ${totalSeats}/${maxSeats}`);
      if (remaining > 0) parts.push(`🪑 *Seats Available:* ${remaining}`);
      else parts.push(`❌ *Fully Booked*`);

      const names = passengers.map((p) => `• ${p.name || "—"} (${p.phone || "—"})`).join("\n");
      parts.push(`\n*Passenger List:*\n${names}`);
    }

    parts.push("\n━━━━━━━━━━━━━━━━━");
    parts.push("📞 *Bookings & Inquiries:* +265989127308");
    parts.push("💬 *WhatsApp:* https://wa.me/265989127308\n");
    parts.push("_Safe Journeys • Trusted Service_");

    setWhatsappMsg(parts.join("\n"));
  };

  const copyWhatsAppMessage = async () => {
    try {
      await navigator.clipboard.writeText(whatsappMsg);
      setWhatsappCopied(true);
      setTimeout(() => setWhatsappCopied(false), 2000);
    } catch {
      alert("Copy failed. Please select and copy manually.");
    }
  };

  const saveSettings = () => {
    try {
      localStorage.setItem("twh_settings", JSON.stringify(settings));
      setSettingsMsg("Settings saved to local storage!");
      setTimeout(() => setSettingsMsg(""), 3000);
    } catch {
      setSettingsMsg("Failed to save settings.");
    }
  };

  const changePassword = () => {
    if (!newPassword.trim()) {
      setSettingsMsg("Please enter a new password.");
      return;
    }
    try {
      localStorage.setItem("twh_admin_password", newPassword.trim());
      setSettingsMsg(`Password changed to: ${newPassword.trim()}. Login will use this password.`);
      setNewPassword("");
      setTimeout(() => setSettingsMsg(""), 5000);
    } catch {
      setSettingsMsg("Failed to change password.");
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="hidden md:block">
        <div className="h-6" />
      </div>

      <div className="min-h-screen flex flex-col lg:flex-row">
        <aside className="w-full lg:w-72 bg-[#1a0f00] text-white p-4 lg:p-6 shrink-0">
          <div className="flex items-center gap-3 mb-6 lg:mb-10">
            <Image
              src="/logo.png"
              width={40}
              height={40}
              className="rounded-full object-cover"
              alt="Travel with Hawkins"
            />
            <div>
              <h1 className="text-base font-bold leading-tight">Travel with Hawkins</h1>
              <p className="text-sm opacity-70">Transport Operations</p>
            </div>
          </div>

          <div className="flex lg:hidden gap-1 overflow-x-auto pb-2">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  activeTab === tab.key
                    ? "bg-[#E8650A]/20 border border-[#E8650A]/30"
                    : "opacity-70 hover:opacity-100"
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          <nav className="hidden lg:block space-y-1 text-sm">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition ${
                  activeTab === tab.key
                    ? "bg-[#E8650A]/20 border border-[#E8650A]/20 font-semibold"
                    : "opacity-70 hover:opacity-100 hover:bg-[#E8650A]/10"
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
            <hr className="border-[#E8650A]/20 my-3" />
            <button
              onClick={handleLogout}
              className="w-full text-left px-3 py-2.5 rounded-lg text-red-300 hover:bg-red-900/30 transition"
            >
              🚪 Logout
            </button>
          </nav>
        </aside>

        <main className="flex-1 p-4 sm:p-6 overflow-x-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1a0f00] text-[#1a0f00]">
                {TABS.find((t) => t.key === activeTab)?.icon} {TABS.find((t) => t.key === activeTab)?.label || "Dashboard"}
              </h2>
              <p className="text-sm text-slate-500 mt-1">{formatDate(new Date())}</p>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative w-full sm:w-64">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">🔎</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search bookings..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-[#E8650A]/50 focus:border-[#E8650A]"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute inset-y-0 right-2 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setLoading(true);
                  void refreshBookings().finally(() => setLoading(false));
                }}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition shrink-0"
              >
                Refresh
              </button>
              <button
                onClick={handleLogout}
                className="lg:hidden bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition shrink-0"
              >
                Logout
              </button>
            </div>
          </div>

          {loading ? (
            <div className="bg-white border border-[#f0e0d0] rounded-xl shadow-sm p-8">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-[#E8650A] animate-pulse" />
                <p className="text-slate-600 font-medium">Loading data...</p>
              </div>
            </div>
          ) : (
            <>
              {activeTab === "overview" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-[#f0e0d0]">
                      <p className="text-xs text-slate-500">Total Bookings</p>
                      <h3 className="text-2xl font-extrabold text-[#1a0f00]">{overviewStats.total}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-[#f0e0d0]">
                      <p className="text-xs text-slate-500">Active Trips</p>
                      <h3 className="text-2xl font-extrabold text-[#1a0f00]">{overviewStats.uniqueTrips}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-[#f0e0d0]">
                      <p className="text-xs text-slate-500">Active Dispatches</p>
                      <h3 className="text-2xl font-extrabold text-purple-600">{overviewStats.activeDispatches}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-[#f0e0d0]">
                      <p className="text-xs text-slate-500">Students</p>
                      <h3 className="text-2xl font-extrabold text-[#1a0f00]">{overviewStats.uniqueStudents}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-[#f0e0d0]">
                      <p className="text-xs text-slate-500">Total Seats</p>
                      <h3 className="text-2xl font-extrabold text-[#1a0f00]">{overviewStats.totalSeats}</h3>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-[#f0e0d0]">
                      <p className="text-xs text-slate-500">Total Revenue</p>
                      <h3 className="text-2xl font-extrabold text-[#E8650A]">MWK {overviewStats.totalRevenue.toLocaleString()}</h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl">
                      <p className="text-xs text-yellow-700">Pending</p>
                      <h3 className="text-xl font-bold text-yellow-800">{overviewStats.pending}</h3>
                      <p className="text-[10px] text-yellow-600">MWK {overviewStats.pendingRevenue.toLocaleString()}</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 p-4 rounded-xl">
                      <p className="text-xs text-green-700">Confirmed</p>
                      <h3 className="text-xl font-bold text-green-800">{overviewStats.confirmed}</h3>
                      <p className="text-[10px] text-green-600">MWK {overviewStats.confirmedRevenue.toLocaleString()}</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
                      <p className="text-xs text-emerald-700">Completed</p>
                      <h3 className="text-xl font-bold text-emerald-800">{overviewStats.completed}</h3>
                    </div>
                    <div className="bg-red-50 border border-red-200 p-4 rounded-xl">
                      <p className="text-xs text-red-700">Cancelled</p>
                      <h3 className="text-xl font-bold text-red-800">{overviewStats.cancelled}</h3>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "trips" && (
                <div>
                  {Object.keys(tripGroups).length === 0 ? (
                    <div className="bg-white border border-[#f0e0d0] rounded-xl shadow-sm p-8 text-center">
                      <p className="text-slate-700 font-semibold text-lg">No trips found</p>
                      <p className="text-sm text-slate-500 mt-1">Create a booking to generate a trip.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                      {Object.entries(tripGroups).map(([tripId, passengers]) => {
                        const dest = passengers[0]?.destination || "—";
                        const date = passengers[0]?.travelDate || "—";
                        const status = passengers[0]?.status || "Pending";
                        const totalSeats = passengers.reduce((s, p) => s + (p.seats || 1), 0);
                        const maxSeats = parseInt(settings.maxSeats) || 15;
                        const fillPercent = Math.min(100, Math.round((totalSeats / maxSeats) * 100));
                        const isUpdating = statusUpdating === tripId;

                        return (
                          <div
                            key={tripId}
                            className="bg-white rounded-2xl shadow-sm border border-[#f0e0d0] p-4 sm:p-5 hover:shadow-lg hover:border-orange-200 transition"
                          >
                            <div className="flex justify-between items-start mb-3 gap-2">
                              <div className="min-w-0 flex-1">
                                <h3 className="font-extrabold text-[#1a0f00] text-sm sm:text-base truncate break-words-force">{tripId}</h3>
                                <p className="text-[11px] text-slate-500 mt-1 break-words-force">📍 {dest}</p>
                                <p className="text-[11px] text-slate-400">📅 {date}</p>
                              </div>
                              <StatusBadge status={status} />
                            </div>

                            <div className="mb-3">
                              <div className="flex justify-between text-xs text-slate-600 mb-1">
                                <span>Seats</span>
                                <span className="font-semibold">
                                  {totalSeats} / {maxSeats}
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                                <div
                                  className={`h-2.5 rounded-full transition-all duration-500 ${
                                    fillPercent >= 100
                                      ? "bg-red-500"
                                      : fillPercent >= 80
                                      ? "bg-orange-500"
                                      : "bg-[#006B3F]"
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
                              {[
                                ["Confirm", "Confirmed"],
                                ["Boarding", "Boarding"],
                                ["Departed", "Departed"],
                                ["Cancel", "Cancelled"],
                              ].map(([label, s]) => (
                                <button
                                  key={s}
                                  onClick={() => void updateStatus(tripId, s)}
                                  disabled={isUpdating}
                                  className={`${(STATUS_COLORS[s] || STATUS_COLORS.Pending).button} text-white text-[11px] py-1.5 rounded-lg font-semibold disabled:opacity-50 transition`}
                                >
                                  {isUpdating ? "..." : label}
                                </button>
                              ))}
                            </div>

                            <details className="text-xs">
                              <summary className="text-[#E8650A] hover:text-[#c94f00] cursor-pointer font-semibold">
                                View Passengers ({passengers.length})
                              </summary>
                              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                                {passengers.map((p, i) => (
                                  <div
                                    key={i}
                                    className="flex justify-between items-center py-1 border-b border-[#f0e0d0] last:border-0"
                                  >
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
              )}

              {/* ================= BOOKINGS TAB ================= */}
              {activeTab === "bookings" && (
                <div className="bg-white border border-[#f0e0d0] rounded-xl shadow-sm overflow-hidden">
                  {filtered.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-slate-700 font-semibold">No bookings found</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[#fff8f2] border-b border-slate-200">
                          <tr>
                            <th className="text-left p-3 font-semibold text-slate-600 text-xs">Booking ID</th>
                            <th className="text-left p-3 font-semibold text-slate-600 text-xs">Name</th>
                            <th className="text-left p-3 font-semibold text-slate-600 text-xs hidden md:table-cell">Student</th>
                            <th className="text-left p-3 font-semibold text-slate-600 text-xs hidden md:table-cell">Destination</th>
                            <th className="text-left p-3 font-semibold text-slate-600 text-xs hidden sm:table-cell">Date</th>
                            <th className="text-center p-3 font-semibold text-slate-600 text-xs">Seats</th>
                            <th className="text-center p-3 font-semibold text-slate-600 text-xs">Status</th>
                            <th className="text-right p-3 font-semibold text-slate-600 text-xs">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filtered.map((b, i) => (
                            <tr key={`${b.bookingId || i}`} className="hover:bg-[#fff8f2] transition">
                              <td className="p-3 font-mono text-xs text-slate-600 break-words-force max-w-[100px]">{b.bookingId || "—"}</td>
                              <td className="p-3 font-medium text-slate-900 break-words-force">{b.name || "—"}</td>
                              <td className="p-3 text-slate-600 hidden md:table-cell break-words-force">{b.studentId || "—"}</td>
                              <td className="p-3 text-slate-600 hidden md:table-cell break-words-force">{b.destination || "—"}</td>
                              <td className="p-3 text-slate-600 hidden sm:table-cell">{b.travelDate || "—"}</td>
                              <td className="p-3 text-center font-semibold">{b.seats || 1}</td>
                              <td className="p-3 text-center">
                                <StatusBadge status={b.status} />
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex flex-wrap gap-1 justify-end">
                                  {[
                                    ["Confirm", "Confirmed"],
                                    ["Boarding", "Boarding"],
                                    ["Departed", "Departed"],
                                    ["Cancel", "Cancelled"],
                                  ].map(([label, s]) => (
                                    <button
                                      key={s}
                                      onClick={() => void updateStatus(b.bookingId || "", s, false)}
                                      disabled={statusUpdating === b.bookingId}
                                      className={`${(STATUS_COLORS[s] || STATUS_COLORS.Pending).button} text-white text-[10px] px-2 py-1 rounded-lg font-semibold disabled:opacity-50 transition`}
                                    >
                                      {statusUpdating === b.bookingId ? "..." : label}
                                    </button>
                                  ))}

                                  {/* Payment confirmation shortcut */}
                                  <button
                                    onClick={async () => {
                                      const id = b.bookingId || "";
                                      if (!id) return;
                                      setStatusUpdating(id);
                                      try {
                                        const res = await fetch(API_URL, {
                                          method: "POST",
                                          body: JSON.stringify({
                                            action: "confirmPayment",
                                            bookingId: id,
                                            token: GATEWAY_TOKEN,
                                          }),
                                        });
                                        const result = await res.json();
                                        if (!result?.success) {
                                          alert(result?.error || "Failed to confirm payment");
                                        }
                                      } catch (e) {
                                        console.error(e);
                                        alert("Network error confirming payment");
                                      } finally {
                                        await refreshBookings();
                                        setStatusUpdating(null);
                                      }
                                    }}
                                    disabled={statusUpdating === b.bookingId}
                                    className={`${(STATUS_COLORS["Confirmed"] || STATUS_COLORS.Pending).button} text-white text-[10px] px-2 py-1 rounded-lg font-semibold disabled:opacity-50 transition`}
                                  >
                                    {statusUpdating === b.bookingId ? "..." : "✓ Pay"}
                                  </button>

                                  <button
                                    onClick={() => void deleteBooking(b.bookingId || "")}
                                    disabled={deleting === b.bookingId}
                                    className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-[10px] px-2 py-1 rounded-lg font-semibold transition"
                                  >
                                    {deleting === b.bookingId ? "..." : "✕"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ================= STUDENTS CRM TAB ================= */}
              {activeTab === "students" && (
                <div className="space-y-4">
                  {studentGroups.length === 0 ? (
                    <div className="bg-white border border-[#f0e0d0] rounded-xl shadow-sm p-8 text-center">
                      <p className="text-slate-700 font-semibold text-lg">No students found</p>
                    </div>
                  ) : (
                    studentGroups.map((student) => (
                      <div key={student.studentId} className="bg-white rounded-xl shadow-sm border border-[#f0e0d0] p-4 sm:p-5 hover:shadow-md transition">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-[#1a0f00] break-words-force">{student.name}</h3>
                            <p className="text-xs text-slate-500">ID: {student.studentId}</p>
                            <p className="text-xs text-slate-400">📱 {student.phone}</p>
                          </div>
                          <div className="flex gap-4 text-sm shrink-0">
                            <div className="text-center">
                              <p className="font-bold text-[#1a0f00]">{student.bookings.length}</p>
                              <p className="text-[10px] text-slate-500">Bookings</p>
                            </div>
                            <div className="text-center">
                              <p className="font-bold text-[#1a0f00]">{student.totalSeats}</p>
                              <p className="text-[10px] text-slate-500">Seats</p>
                            </div>
                            <div className="text-center">
                              <p className="font-bold text-[#E8650A]">MWK {student.totalSpent.toLocaleString()}</p>
                              <p className="text-[10px] text-slate-500">Spent</p>
                            </div>
                          </div>
                        </div>

                        <details className="mt-3">
                          <summary className="text-xs text-[#E8650A] hover:text-[#c94f00] cursor-pointer font-semibold">
                            View Booking History ({student.bookings.length})
                          </summary>
                          <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                            {student.bookings.slice(0, 10).map((b, i) => (
                              <div key={i} className="flex justify-between items-center py-1.5 border-b border-[#f0e0d0] last:border-0 text-xs">
                                <div className="min-w-0 flex-1">
                                  <span className="text-slate-700 break-words-force">{b.destination || "—"}</span>
                                  <span className="text-slate-400 ml-2">({b.travelDate || "—"})</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-slate-500">
                                    {b.seats || 1} seat{b.seats !== 1 ? "s" : ""}
                                  </span>
                                  <StatusBadge status={b.status} />
                                </div>
                              </div>
                            ))}
                            {student.bookings.length > 10 && (
                              <p className="text-[10px] text-slate-400 text-center">+{student.bookings.length - 10} more bookings</p>
                            )}
                          </div>
                        </details>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ================= WHATSAPP BROADCAST TAB ================= */}
              {activeTab === "whatsapp" && (
                <div className="space-y-6">
                  <div className="bg-white border border-[#f0e0d0] rounded-xl shadow-sm p-6">
                    <h3 className="font-bold text-[#1a0f00] mb-2">📢 WhatsApp Broadcast Studio</h3>
                    <p className="text-sm text-slate-500 mb-4">
                      Generate a formatted promotional message from active trip manifests, ready to share on student WhatsApp groups.
                    </p>
                    <button
                      onClick={generateWhatsAppMessage}
                      className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-semibold shadow-sm transition"
                    >
                      📱 Generate Broadcast Message
                    </button>
                  </div>

                  {whatsappMsg && (
                    <div className="bg-white border border-[#f0e0d0] rounded-xl shadow-sm p-6">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-bold text-[#1a0f00] text-sm">Your Broadcast Message</h4>
                        <button
                          onClick={copyWhatsAppMessage}
                          className="bg-[#1a0f00] hover:bg-[#3a2010] text-white px-4 py-1.5 rounded-lg text-xs font-semibold transition"
                        >
                          {whatsappCopied ? "✓ Copied!" : "📋 Copy"}
                        </button>
                      </div>
                      <textarea
                        readOnly
                        value={whatsappMsg}
                        rows={20}
                        className="w-full border border-slate-200 rounded-xl p-4 text-sm bg-white text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-[#E8650A] resize-y whitespace-pre-wrap break-words-force"
                      />
                    </div>
                  )}

                  {Object.keys(tripGroups).length > 0 && !whatsappMsg && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-sm text-amber-800">
                        ⚡ {Object.keys(tripGroups).length} active trip{Object.keys(tripGroups).length === 1 ? "" : "s"} ready for broadcast.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ================= SETTINGS TAB ================= */}
              {activeTab === "settings" && (
                <div className="max-w-2xl space-y-6">
                  <div className="bg-white border border-[#f0e0d0] rounded-xl shadow-sm p-6">
                    <h3 className="font-bold text-[#1a0f00] mb-2">⚙️ System Configuration</h3>
                    <p className="text-sm text-slate-500 mb-4">Adjust ticket parameters, routes, and vehicle settings.</p>

                    {settingsMsg && (
                      <div className="bg-orange-50 border border-orange-200 text-[#c94f00] p-3 rounded-lg mb-4 text-sm">{settingsMsg}</div>
                    )}


                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Booking Fee (flat, paid when Confirmed/✓ Pay) (MWK)</label>

                        <input
                          type="number"
                          value={settings.bookingFee}
                          onChange={(e) => setSettings({ ...settings, bookingFee: e.target.value })}
                          className="w-full border border-gray-300 p-2.5 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8650A]"
                        />
                        <p className="text-[12px] text-slate-500 mt-2">
                          Added once per booking (regardless of destination). This updates the Overview cashflow.
                        </p>
                      </div>


                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Max Seats per Vehicle</label>
                        <input
                          type="number"
                          value={settings.maxSeats}
                          onChange={(e) => setSettings({ ...settings, maxSeats: e.target.value })}
                          className="w-full border border-gray-300 p-2.5 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8650A]"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Fair rates per route (per seat) (MWK)</label>
                        <FairRatesEditor
                          routesStr={settings.routes}
                          onChange={(next) => setSettings({ ...settings, routes: next })}
                        />

                        {/* legacy textarea removed */}
                        {/*
                          <textarea
                          value={settings.routes}

                          onChange={(e) => setSettings({ ...settings, routes: e.target.value })}
                          rows={6}
                          placeholder="Example:\nMzuzu → Lilongwe: 5000\nMzuzu → Blantyre: 8000"
                          className="w-full border border-gray-300 p-2.5 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8650A] resize-y"
                        />

                        <p className="text-[12px] text-slate-500 mt-2">
                          One per line. Format: <span className="font-mono">Destination: Fair</span>
                          (fair is per seat). Example: <span className="font-mono">Mzuzu → Lilongwe: 5000</span>
                        </p>
                        */}
                      </div>


                      <button
                        onClick={saveSettings}
                        className="bg-[#1a0f00] hover:bg-[#3a2010] text-white px-5 py-2.5 rounded-lg font-semibold shadow-sm transition"
                      >
                        💾 Save Settings
                      </button>
                    </div>
                  </div>

                  <div className="bg-white border border-[#f0e0d0] rounded-xl shadow-sm p-6">
                    <h3 className="font-bold text-[#1a0f00] mb-2">🔑 Change Admin Password</h3>
                    <p className="text-sm text-slate-500 mb-4">Update the secret admin login password.</p>
                    <div className="flex gap-3 items-end">
                      <div className="flex-1">
                        <label className="block text-sm font-semibold text-slate-700 mb-1">New Password</label>
                        <input
                          type="text"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password"
                          className="w-full border border-gray-300 p-2.5 rounded-lg bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8650A]"
                        />
                      </div>
                      <button
                        onClick={changePassword}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg font-semibold shadow-sm transition shrink-0"
                      >
                        🔄 Change
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

