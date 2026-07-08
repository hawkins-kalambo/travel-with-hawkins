"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/auth";
import { type BookingRecord } from "@/lib/bookingTypes";
import { generateReceiptPdfBlob } from "@/lib/receiptGenerator";

// ================= TYPES =================
type JourneyStatus =
  | "Booked"
  | "Confirmed"
  | "Boarding"
  | "Arrived"
  | "Completed"
  | "Cancelled"
  | string;

type PaymentStatus = "Pending" | "Payment Confirmed" | "Failed" | string;

type EnrichedBooking = BookingRecord & {
  status: JourneyStatus;
  paymentStatus: PaymentStatus;
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
  b: { destination?: string; seats?: number; fare?: number; paymentStatus?: string },
  routesStr: string,
  bookingFeeStr: string
): { ticketRevenue: number; bookingFee: number; total: number } {
  const routePrice = getRoutePrice(b.destination, routesStr);
  const ticketPrice = typeof b.fare === "number" && Number.isFinite(b.fare) && b.fare > 0 ? b.fare : routePrice;
  const seats = b.seats || 1;

  const isPaid = String(b.paymentStatus || "Pending") === "Payment Confirmed";
  const fee = isPaid ? getBookingFee(bookingFeeStr) : 0;

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
  // (this repo's eslint forbids it).
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
            className="input-field"
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
            className="input-field"
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={save}
          disabled={!selected}
          className="btn-primary disabled:opacity-50"
        >
          ✓ Set Fair
        </button>
        <button
          onClick={addNew}
          className="btn-secondary"
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
// Admin dashboard is Supabase-only. Legacy Google Apps Script API is removed.
const API_BASE = "/api/bookings";

// Helper that attaches the current Supabase session access token as a
// Bearer Authorization header when available. This allows server-side
// auth helpers to accept the token when cookies are not present.
async function authFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token;

    const headers = new Headers(init?.headers as HeadersInit | undefined);
    if (token) headers.set("Authorization", `Bearer ${token}`);

    return fetch(input, { ...init, headers, credentials: "same-origin" });
  } catch {
    return fetch(input, { ...init, credentials: "same-origin" });
  }
}

const TABS: { key: TabName; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "" },
  { key: "trips", label: "Trips", icon: "" },
  { key: "bookings", label: "Bookings", icon: "" },
  { key: "students", label: "Students CRM", icon: "" },
  { key: "whatsapp", label: "WhatsApp Broadcast", icon: "" },
  { key: "settings", label: "Settings", icon: "" },
];

const JOURNEY_STATUS_COLORS: Record<string, { badge: string; button: string }> = {
  Booked: { badge: "bg-amber-50 text-amber-700 border-amber-200", button: "bg-amber-600 hover:bg-amber-700" },
  Confirmed: { badge: "bg-[#eef6ff] text-[#0a2d56] border-[#b8dcff]", button: "bg-[#0f3f78] hover:bg-[#0a2d56]" },
  Boarding: { badge: "bg-orange-50 text-orange-700 border-orange-200", button: "bg-orange-600 hover:bg-orange-700" },
  Departed: { badge: "bg-violet-50 text-violet-700 border-violet-200", button: "bg-violet-600 hover:bg-violet-700" },
  Arrived: { badge: "bg-sky-50 text-sky-700 border-sky-200", button: "bg-sky-600 hover:bg-sky-700" },
  Completed: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", button: "bg-emerald-600 hover:bg-emerald-700" },
  Cancelled: { badge: "bg-[color:var(--danger)]/10 text-[color:var(--danger)] border-[color:var(--danger)]/20", button: "bg-[color:var(--danger)] hover:bg-[color:var(--danger)]/90" },
};

const PAYMENT_STATUS_COLORS: Record<string, { badge: string; button: string }> = {
  Pending: { badge: "bg-[color:var(--warning)]/10 text-[color:var(--warning)] border-[color:var(--warning)]/20", button: "bg-amber-600 hover:bg-amber-700" },
  "Payment Confirmed": { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", button: "bg-emerald-600 hover:bg-emerald-700" },
  Failed: { badge: "bg-[color:var(--danger)]/10 text-[color:var(--danger)] border-[color:var(--danger)]/20", button: "bg-red-600 hover:bg-red-700" },
};

// (left intentionally unused - journey normalization handled server-side) 


const VALID_PAYMENT_STATUSES: ReadonlySet<string> = new Set([
  "Pending",
  "Payment Confirmed",
  "Failed",
]);

// journey normalization helper removed (UI trusts API-provided values)



function getPaymentStatus(raw: unknown): PaymentStatus {
  if (typeof raw === "string" && raw.trim()) {
    const trimmed = raw.trim();
    if (VALID_PAYMENT_STATUSES.has(trimmed)) return trimmed as PaymentStatus;
  }
  return "Pending";
}

function formatDate(date: Date): string {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${weekdays[date.getDay()]}, ${months[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")}, ${date.getFullYear()}`;
}

function StatusBadge({ status }: { status: JourneyStatus }) {
  const s = String(status || "Booked");
  const colors = JOURNEY_STATUS_COLORS[s] ?? JOURNEY_STATUS_COLORS.Booked;
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold border ${colors.badge}`}>
      {s}
    </span>
  );
}

function PaymentBadge({ status }: { status: PaymentStatus }) {
  const s = String(status || "Pending");
  const colors = PAYMENT_STATUS_COLORS[s] ?? PAYMENT_STATUS_COLORS.Pending;
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold border ${colors.badge}`}>
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
  const [paymentUpdating, setPaymentUpdating] = useState<string | null>(null);
  const [sendingReceipt, setSendingReceipt] = useState<string | null>(null);
  const [generatedReceiptBookingId, setGeneratedReceiptBookingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const defaultSettings = useMemo(
    () => ({
      ticketFee: "5000",
      bookingFee: "2000",
      maxSeats: "15",
      secretPassword: "1234",
      routes:
        "Mzuzu - Lilongwe: 5000\nMzuzu - Blantyre: 8000\nMzuzu - Zomba: 7000\nMzuzu - Kasungu: 3000\nMzuzu - Karonga: 6000",
    }),
    []
  );

  const [settings, setSettings] = useState(defaultSettings);
  const [settingsStatus, setSettingsStatus] = useState<"idle" | "success" | "error">("idle");

  const [settingsMsg, setSettingsMsg] = useState("");

  const [whatsappMsg, setWhatsappMsg] = useState("");
  const [whatsappCopied, setWhatsappCopied] = useState(false);

  const refreshBookings = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}`, { method: "GET", cache: "no-store" });
      if (!res.ok) {
        console.error("Failed to refresh bookings: HTTP", res.status);
        return;
      }
      const data: unknown = await res.json();
      const list = (data as { bookings?: unknown } | null | undefined)?.bookings;
      console.log("UI refreshBookings response sample", {
        hasBookings: Array.isArray(list),
        sampleStatuses: Array.isArray(list)
          ? (list as unknown[]).slice(0, 5).map((x) => (x as Record<string, unknown>)?.status)
          : [],
      });

      // API already returns normalized BookingRecord fields (including `status`).
      // Avoid re-normalizing here to ensure `status` survives deterministically.
      const source: BookingRecord[] = Array.isArray(list) ? (list as BookingRecord[]) : [];
      const enriched: EnrichedBooking[] = source.map((b) => ({
        ...b,
        // Trust API-normalized journey status from /api/bookings
        // (only fallback if it's missing)
        status:
          typeof b.status === "string" && b.status.trim() ? (b.status as JourneyStatus) : "Booked",
        // Payment status may still need normalization
        paymentStatus: getPaymentStatus(b.paymentStatus),
      }));
      setBookings([...enriched]);
    } catch (error) {
      console.error("Failed to refresh bookings:", error);
    }
  }, []);


  const loadSettings = useCallback(async () => {
    try {
      const res = await authFetch("/api/settings", { method: "GET" });
      const data: unknown = await res.json();
      const payload = (data as { settings?: Record<string, unknown> } | null | undefined)?.settings;

      if (payload) {
        setSettings({
          ...defaultSettings,
          bookingFee: String(payload.booking_fee ?? payload.bookingFee ?? 0),
          maxSeats: String(payload.max_seats ?? payload.maxSeats ?? defaultSettings.maxSeats),
          routes: String(payload.routes ?? defaultSettings.routes),
        });
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }, [defaultSettings]);

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      await Promise.all([refreshBookings(), loadSettings()]);
      setLoading(false);
    };

    void checkSession();
  }, [router, refreshBookings, loadSettings]);

  useEffect(() => {
    const idleMs = 15 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void supabase.auth.signOut();
        router.push("/login");
      }, idleMs);
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((event) => window.removeEventListener(event, resetTimer));
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  useEffect(() => {
    const id = setInterval(() => void refreshBookings(), 15000);
    return () => clearInterval(id);
  }, [refreshBookings]);

  const handleLogout = async () => {
  await supabase.auth.signOut();
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
    const pending = bookings.filter((b) => b.paymentStatus === "Pending").length;
    const confirmed = bookings.filter((b) => b.paymentStatus === "Payment Confirmed").length;
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

      if (b.paymentStatus === "Pending") {
        pendingTicketRevenue += rev.ticketRevenue;
        pendingBookingFees += rev.bookingFee;
      } else if (b.paymentStatus === "Payment Confirmed") {
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

    const activeDispatches = bookings.filter((b) => b.status === "Boarding").length;

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
    // Single source of truth: group using the real bookings.trip_id.
    const acc: Record<string, EnrichedBooking[]> = {};
    for (const item of filtered) {
      const tripId = String(item.tripId || "").trim();
      if (!tripId) continue;
      if (!acc[tripId]) acc[tripId] = [];
      acc[tripId].push(item);
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

  const updateStatus = async (targetId: string, status: JourneyStatus, byTrip = true) => {
    try {
      setStatusUpdating(targetId);
      const body: Record<string, unknown> = { status };

      if (byTrip) {
        body.tripId = targetId;
      } else {
        body.bookingId = targetId;
      }

      const res = await authFetch(API_BASE, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result = (await res.json()) as { success?: boolean; error?: string };

      const ok = res.ok && result?.success === true;
      if (!ok) {
        const msg = result?.error || `Failed to update status (HTTP ${res.status})`;
        alert(msg);
      }

      // Always refresh so the UI can reflect the real DB state.
      await refreshBookings();

    } catch (error) {
      console.error("Error updating status:", error);
      alert("Network error updating status");
      await refreshBookings();
    } finally {
      setStatusUpdating(null);
    }
  };

  const deleteBooking = async (bookingId: string) => {
    if (!confirm(`Are you sure you want to delete booking ${bookingId}?`)) return;
    try {
      setDeleting(bookingId);
      const res = await authFetch(API_BASE, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bookingId }),
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

  const saveSettings = async () => {
    try {
      const res = await authFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingFee: settings.bookingFee,
          maxSeats: settings.maxSeats,
          routes: settings.routes,
        }),
      });

      const data: unknown = await res.json();
      const success = (data as { success?: unknown })?.success === true;

      if (!success) {
        setSettingsStatus("error");
        setSettingsMsg("❌ Failed to update settings.");
        return;
      }

      setSettingsStatus("success");
      setSettingsMsg("✅ Settings updated successfully.");
      await loadSettings();
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSettingsStatus("error");
      setSettingsMsg("❌ Failed to update settings.");
    } finally {
      setTimeout(() => {
        setSettingsStatus("idle");
        setSettingsMsg("");
      }, 3000);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f8fd] text-[#101815]">
      <div className="hidden md:block">
        <div className="h-6" />
      </div>

      <div className="min-h-screen flex flex-col lg:flex-row">
        <aside className="w-full lg:w-72 bg-[linear-gradient(135deg,#0a2d56_0%,#0f3f78_100%)] text-white p-4 lg:p-6 shrink-0">
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
                    ? "bg-primary-600/10 border border-primary-600/30"
                    : "opacity-70 hover:opacity-100"
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
            <Link
              href="/admin/reports"
              className="shrink-0 rounded-lg border border-primary-600/30 bg-primary-100/80 px-3 py-2 text-xs font-semibold text-primary-900"
            >
              Reports
            </Link>
          </div>

          <nav className="hidden lg:block space-y-1 text-sm">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition ${
                  activeTab === tab.key
                    ? "bg-primary-600/10 border border-primary-600/20 font-semibold"
                    : "opacity-70 hover:opacity-100 hover:bg-primary-100"
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
            <Link
              href="/admin/reports"
              className="block rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition opacity-70 hover:opacity-100 hover:bg-primary-100"
            >
               Reports & Manifests
            </Link>
            <hr className="my-3 border-primary-200/60" />
            <button
              onClick={handleLogout}
              className="w-full text-left px-3 py-2.5 rounded-lg text-red-300 hover:bg-red-900/30 transition"
            >
               Logout
            </button>
          </nav>
        </aside>

        <main className="flex-1 p-4 sm:p-6 overflow-x-hidden bg-[#f4f8fd]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-primary-900">
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
                  className="w-full pl-9 pr-3 py-2 border border-[#d7ebff] rounded-xl text-sm bg-[#eef6ff] text-[#101815] placeholder:text-[#64748b] focus:outline-none focus:ring-4 focus:ring-[#0f3f78]/20 focus:border-[#0f3f78]"
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
              <Link
                href="/admin/reports"
                className="inline-flex items-center justify-center rounded-lg border border-[#d7ebff] bg-white px-3 py-2 text-sm font-semibold text-[#0f3f78] shadow-sm transition hover:bg-[#eef6ff] sm:hidden"
              >
                Reports
              </Link>
              <button
                onClick={() => {
                  setLoading(true);
                  void refreshBookings().finally(() => setLoading(false));
                }}
                className="bg-[#0f3f78] hover:bg-[#0a2d56] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition shrink-0"
              >
                Refresh
              </button>
              <button
                onClick={handleLogout}
                className="lg:hidden bg-[color:var(--danger)] hover:bg-[color:var(--danger)]/90 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition shrink-0"
              >
                Logout
              </button>
            </div>
          </div>

          {loading ? (
            <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-8">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-accent-600 animate-pulse" />
                <p className="text-slate-600 font-medium">Loading data...</p>
              </div>
            </div>
          ) : (
            <>
              {activeTab === "overview" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-xs text-slate-500">Total Bookings</p>
                      <h3 className="text-2xl font-extrabold text-primary-900">{overviewStats.total}</h3>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-xs text-slate-500">Active Trips</p>
                      <h3 className="text-2xl font-extrabold text-primary-900">{overviewStats.uniqueTrips}</h3>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-xs text-slate-500">Active Dispatches</p>
                      <h3 className="text-2xl font-extrabold text-primary-700">{overviewStats.activeDispatches}</h3>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-xs text-slate-500">Students</p>
                      <h3 className="text-2xl font-extrabold text-primary-900">{overviewStats.uniqueStudents}</h3>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-xs text-slate-500">Total Seats</p>
                      <h3 className="text-2xl font-extrabold text-primary-900">{overviewStats.totalSeats}</h3>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-xs text-slate-500">Total Revenue</p>
                      <h3 className="text-2xl font-extrabold text-primary-700">MWK {overviewStats.totalRevenue.toLocaleString()}</h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    <div className="rounded-xl border border-[color:var(--warning)]/20 bg-[color:var(--warning)]/10 p-4">
                      <p className="text-xs text-[color:var(--warning)]">Pending</p>
                      <h3 className="text-xl font-bold text-[color:var(--warning)]">{overviewStats.pending}</h3>
                      <p className="text-[10px] text-[color:var(--warning)]/80">MWK {overviewStats.pendingRevenue.toLocaleString()}</p>
                    </div>
                    <div className="rounded-xl border border-primary-200 bg-primary-100 p-4">
                      <p className="text-xs text-primary-700">Confirmed</p>
                      <h3 className="text-xl font-bold text-primary-800">{overviewStats.confirmed}</h3>
                      <p className="text-[10px] text-primary-700/80">MWK {overviewStats.confirmedRevenue.toLocaleString()}</p>
                    </div>
                    <div className="rounded-xl border border-primary-200 bg-primary-100 p-4">
                      <p className="text-xs text-primary-700">Completed</p>
                      <h3 className="text-xl font-bold text-primary-800">{overviewStats.completed}</h3>
                    </div>
                    <div className="rounded-xl border border-[color:var(--danger)]/20 bg-[color:var(--danger)]/10 p-4">
                      <p className="text-xs text-[color:var(--danger)]">Cancelled</p>
                      <h3 className="text-xl font-bold text-[color:var(--danger)]">{overviewStats.cancelled}</h3>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "trips" && (
                <div>
                  {Object.keys(tripGroups).length === 0 ? (
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
                        const totalSeats = passengers.reduce((s, p) => s + (p.seats || 1), 0);
                        const maxSeats = parseInt(settings.maxSeats) || 15;
                        const fillPercent = Math.min(100, Math.round((totalSeats / maxSeats) * 100));
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
                                  className={`${(JOURNEY_STATUS_COLORS[s] || JOURNEY_STATUS_COLORS.Confirmed).button} rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white transition disabled:opacity-50`}
                                >
                                  {isUpdating ? "..." : label}
                                </button>
                              ))}
                            </div>

                            <details className="text-xs">
                              <summary className="cursor-pointer font-semibold text-accent-600 hover:text-accent-700">
                                View Passengers ({passengers.length})
                              </summary>
                              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                                {passengers.map((p, i) => (
                                  <div
                                    key={i}
                                    className="flex justify-between items-center py-1 border-b border-[#d7ebff] last:border-0"
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
                <div className="bg-[#eef6ff] border border-[#d7ebff] rounded-xl shadow-sm overflow-hidden">
                  {filtered.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-slate-700 font-semibold">No bookings found</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-[#f4f8fd] border-b border-slate-200">
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
                            <tr key={`${b.bookingId || i}`} className="hover:bg-[#f4f8fd] transition">
                              <td className="p-3 font-mono text-xs text-slate-600 break-words-force max-w-25">{b.bookingId || "—"}</td>
                              <td className="p-3 font-medium text-slate-900 break-words-force">{b.name || "—"}</td>
                              <td className="p-3 text-slate-600 hidden md:table-cell break-words-force">{b.studentId || "—"}</td>
                              <td className="p-3 text-slate-600 hidden md:table-cell break-words-force">{b.destination || "—"}</td>
                              <td className="p-3 text-slate-600 hidden sm:table-cell">{b.travelDate || "—"}</td>
                              <td className="p-3 text-center font-semibold">{b.seats || 1}</td>
                              <td className="p-3 text-center">
                                <StatusBadge status={b.status} />
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <PaymentBadge status={b.paymentStatus} />
                                  {b.receiptSent ? (
                                    <span className="text-[10px] text-emerald-700">Receipt sent</span>
                                  ) : null}
                                </div>
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
                                      className={`${(JOURNEY_STATUS_COLORS[s] || JOURNEY_STATUS_COLORS.Confirmed).button} text-white text-[10px] px-2 py-1 rounded-lg font-semibold disabled:opacity-50 transition`}
                                    >
                                      {statusUpdating === b.bookingId ? "..." : label}
                                    </button>
                                  ))}

                                  {/* Payment confirmation shortcut */}
                                  <button
                                    onClick={async () => {
                                      const id = b.bookingId || "";
                                      if (!id) return;
                                      setPaymentUpdating(id);
                                      try {
                                        const res = await authFetch("/api/payments/confirm", {
                                          method: "POST",
                                          headers: {
                                            "Content-Type": "application/json",
                                          },
                                          body: JSON.stringify({ bookingId: id }),
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
                                        setPaymentUpdating(null);
                                      }
                                    }}
                                    disabled={paymentUpdating === b.bookingId || b.paymentStatus === "Payment Confirmed"}
                                    className={`${PAYMENT_STATUS_COLORS["Payment Confirmed"].button} text-white text-[10px] px-2 py-1 rounded-lg font-semibold disabled:opacity-50 transition`}
                                  >
                                    {paymentUpdating === b.bookingId ? "..." : b.paymentStatus === "Payment Confirmed" ? "Paid" : "Confirm Payment"}
                                  </button>

                                  {b.paymentStatus === "Payment Confirmed" ? (
                                    <>
                                      <button
                                        onClick={() => {
                                          const id = b.bookingId || "";
                                          if (!id) return;
                                          try {
                                            const pdfBlob = generateReceiptPdfBlob(b);
                                            const url = URL.createObjectURL(pdfBlob);
                                            const anchor = document.createElement("a");
                                            anchor.href = url;
                                            anchor.download = `${b.receiptNumber || b.bookingId || "receipt"}.pdf`;
                                            anchor.click();
                                            URL.revokeObjectURL(url);
                                            setGeneratedReceiptBookingId(id);
                                          } catch (error) {
                                            console.error("Receipt generation failed", error);
                                            alert("Failed to generate receipt PDF.");
                                          }
                                        }}
                                        className="bg-slate-800 hover:bg-slate-900 text-white text-[10px] px-2 py-1 rounded-lg font-semibold transition"
                                      >
                                        Generate Receipt
                                      </button>
                                      <button
                                        onClick={async () => {
                                          const id = b.bookingId || "";
                                          if (!id) return;
                                          if (!b.email) return;
                                          setSendingReceipt(id);
                                          try {
                                            const res = await authFetch("/api/payments/send-receipt", {
                                              method: "POST",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ bookingId: id }),
                                            });
                                            const result = await res.json();
                                            if (!result?.success) {
                                              alert(result?.error || "Failed to send receipt");
                                            } else {
                                              await refreshBookings();
                                            }
                                          } catch (error) {
                                            console.error(error);
                                            alert("Network error sending receipt");
                                          } finally {
                                            setSendingReceipt(null);
                                          }
                                        }}
                                        disabled={!b.email || sendingReceipt === b.bookingId || generatedReceiptBookingId !== b.bookingId}
                                        className="rounded-lg bg-primary-600 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-primary-700 disabled:bg-primary-200 disabled:text-slate-500"
                                      >
                                        {sendingReceipt === b.bookingId ? "Sending..." : "Send Receipt"}
                                      </button>
                                      {!b.email ? (
                                        <span className="block text-[10px] text-slate-500 mt-1">No customer email available.</span>
                                      ) : generatedReceiptBookingId !== b.bookingId ? (
                                        <span className="block text-[10px] text-slate-500 mt-1">Generate receipt first.</span>
                                      ) : null}
                                    </>
                                  ) : null}

                                  <button
                                    onClick={() => void deleteBooking(b.bookingId || "")}
                                    disabled={deleting === b.bookingId}
                                    className="rounded-lg bg-[color:var(--danger)] px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-[color:var(--danger)]/90 disabled:opacity-50"
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
                    <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-8 text-center">
                      <p className="text-slate-700 font-semibold text-lg">No students found</p>
                    </div>
                  ) : (
                    studentGroups.map((student) => (
                      <div key={student.studentId} className="bg-white rounded-xl shadow-sm border border-[#d7ebff] p-4 sm:p-5 hover:shadow-md transition">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-primary-900 break-words-force">{student.name}</h3>
                            <p className="text-xs text-slate-500">ID: {student.studentId}</p>
                            <p className="text-xs text-slate-400">📱 {student.phone}</p>
                          </div>
                          <div className="flex gap-4 text-sm shrink-0">
                            <div className="text-center">
                              <p className="font-bold text-primary-900">{student.bookings.length}</p>
                              <p className="text-[10px] text-slate-500">Bookings</p>
                            </div>
                            <div className="text-center">
                              <p className="font-bold text-primary-900">{student.totalSeats}</p>
                              <p className="text-[10px] text-slate-500">Seats</p>
                            </div>
                            <div className="text-center">
                              <p className="font-bold text-accent-600">MWK {student.totalSpent.toLocaleString()}</p>
                              <p className="text-[10px] text-slate-500">Spent</p>
                            </div>
                          </div>
                        </div>

                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs font-semibold text-accent-600 hover:text-accent-700">
                            View Booking History ({student.bookings.length})
                          </summary>
                          <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                            {student.bookings.slice(0, 10).map((b, i) => (
                              <div key={i} className="flex justify-between items-center py-1.5 border-b border-[#d7ebff] last:border-0 text-xs">
                                <div className="min-w-0 flex-1">
                                  <span className="text-slate-700 break-words-force">{b.destination || "—"}</span>
                                  <span className="text-slate-400 ml-2">({b.travelDate || "—"})</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-slate-500">
                                    {b.seats || 1} seat{b.seats !== 1 ? "s" : ""}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <StatusBadge status={b.status} />
                                    <PaymentBadge status={b.paymentStatus} />
                                  </div>
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
                  <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-6">
                    <h3 className="mb-2 font-bold text-primary-900">📢 WhatsApp Broadcast Studio</h3>
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
                    <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-6">
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="text-sm font-bold text-primary-900">Your Broadcast Message</h4>
                        <button
                          onClick={copyWhatsAppMessage}
                          className="rounded-lg bg-primary-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-800"
                        >
                          {whatsappCopied ? "✓ Copied!" : "📋 Copy"}
                        </button>
                      </div>
                      <textarea
                        readOnly
                        value={whatsappMsg}
                        rows={20}
                        className="w-full resize-y whitespace-pre-wrap break-words-force rounded-xl border border-slate-200 bg-white p-4 font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600"
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
                  <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-6">
                    <h3 className="mb-2 font-bold text-primary-900">⚙️ System Configuration</h3>
                    <p className="text-sm text-slate-500 mb-4">Adjust ticket parameters, routes, and vehicle settings for the current dashboard session.</p>

                    {settingsMsg && (
                      <div className={`mb-4 rounded-lg border p-3 text-sm ${settingsStatus === "success" ? "border-primary-200 bg-primary-100 text-primary-700" : settingsStatus === "error" ? "border-[color:var(--danger)]/20 bg-[color:var(--danger)]/10 text-[color:var(--danger)]" : "border-[color:var(--warning)]/20 bg-[color:var(--warning)]/10 text-[color:var(--warning)]"}`}>
                        {settingsMsg}
                      </div>
                    )}


                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Booking Fee (flat, paid when Confirmed/✓ Pay) (MWK)</label>

                        <input
                          type="number"
                          value={settings.bookingFee}
                          onChange={(e) => setSettings({ ...settings, bookingFee: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600"
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
                          className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600"
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
                          className="w-full resize-y rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600"
                        />

                        <p className="text-[12px] text-slate-500 mt-2">
                          One per line. Format: <span className="font-mono">Destination: Fair</span>
                          (fair is per seat). Example: <span className="font-mono">Mzuzu → Lilongwe: 5000</span>
                        </p>
                        */}
                      </div>


                      <button
                        onClick={saveSettings}
                        className="rounded-lg bg-primary-900 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-primary-800"
                      >
                         Save Settings
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