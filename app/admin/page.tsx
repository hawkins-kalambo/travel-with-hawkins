"use client";

import { Suspense, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import { authFetch, supabase } from "@/lib/auth";
import { isViewerAllowedTab, normalizeAdminRole } from "@/lib/adminAuth";
import { type BookingRecord } from "@/lib/bookingTypes";
import { getAllowedJourneyTransitions } from "@/lib/bookingLifecycle";
import { canConfirmCashFare, canRecordManualFarePayment } from "@/lib/adminBookingFareActions";
import { parseRoutePrices, resolveRouteFareIfAvailable } from "@/lib/routePricing";
import { calcBookingRevenue } from "@/lib/bookingRevenue";
import { normalizeMalawiPhone } from "@/lib/phoneNumbers";
import { fetchAllUniversities, type ActiveUniversity } from "@/lib/universitiesClient";
import AmbassadorCreationSuccess from "@/app/admin/components/AmbassadorCreationSuccess";
import AmbassadorCreationWizard from "@/app/admin/components/AmbassadorCreationWizard";
import BookingDetailsPanel, { type BookingAuditEntry } from "@/app/admin/components/BookingDetailsPanel";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";

// ================= TYPES =================
type JourneyStatus =
  | "Booked"
  | "Confirmed"
  | "Boarding"
  | "Arrived"
  | "Completed"
  | "Cancelled"
  | string;

type AmbassadorCreationPayload = {
  fullName: string;
  studentId?: string;
  email: string;
  phone: string;
  whatsappNumber?: string;
  faculty?: string;
  program?: string;
  yearOfStudy?: string;
  profileImageBase64?: string;
  referralCode?: string;
  routeAssignment?: string;
  universityId?: string;
  university?: string;
  status?: string;
  temporaryPassword: string;
};

type CreatedAmbassadorCredentials = {
  fullName: string;
  email: string;
  referralCode: string;
  temporaryPassword?: string;
};

type EnrichedBooking = BookingRecord & {
  status: JourneyStatus;
};

type StudentGroup = {
  key: string;
  studentId: string;
  name: string;
  phone: string;
  bookings: EnrichedBooking[];
  totalSeats: number;
  totalSpent: number;
  unpaidFeeCount: number;
  unpaidFareCount: number;
  firstBookingAt: string | undefined;
  lastBookingAt: string | undefined;
  // True when this group was formed without a real Student ID (matched by
  // phone, or — with neither ID nor phone — isolated to a single booking).
  // Surfaced in the UI so admins know the grouping is a best-effort guess,
  // not a verified identity.
  hasIdentityGap: boolean;
};

type TabName = "overview" | "trips" | "bookings" | "students" | "whatsapp" | "referrals" | "settings";

// ================= PRICING HELPERS =================
// Revenue math lives in lib/bookingRevenue.ts (calcBookingRevenue), shared
// with the Reports summary/exports so the two screens can never disagree on
// what "revenue" means.


type FairRatesEditorProps = {
  routesStr: string;
  onChange: (next: string) => void;
};

function FairRatesEditor({ routesStr, onChange }: FairRatesEditorProps) {
  const priceMap = useMemo(() => parseRoutePrices(routesStr), [routesStr]);
  const destinations = useMemo(() => Object.keys(priceMap).sort((a, b) => a.localeCompare(b)), [priceMap]);

  const [selected, setSelected] = useState<string>(destinations[0] || "");
  const [fairValue, setFairValue] = useState<string>("0");

  // Keep fairValue in sync WITHOUT useEffect/setState inside effects
  // (this repo's eslint forbids it).
  // computedFair is kept for previous logic but not currently used.
  // Keeping it removed avoids lint errors.

  const save = () => {
    const nextFair = parseInt(fairValue, 10);
    if (!selected || isNaN(nextFair) || nextFair < 0) return;

    const updated = new Map<string, number>(Object.entries(priceMap));
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

const updated = new Map<string, number>(Object.entries(priceMap));
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
const API_BASE = "/api/admin/bookings";
const BOOKINGS_PAGE_SIZE = 25;

// Helper that attaches the current Supabase session access token as a
// Bearer Authorization header when available. This allows server-side
// auth helpers to accept the token when cookies are not present.
const TABS: { key: TabName; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "" },
  { key: "trips", label: "Trips", icon: "" },
  { key: "bookings", label: "Bookings", icon: "" },
  { key: "students", label: "Students CRM", icon: "" },
  { key: "whatsapp", label: "WhatsApp Broadcast", icon: "" },
  { key: "referrals", label: "Referrals", icon: "" },
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

// Real per-booking payment truth (set by PayChangu webhooks and cash
// collection, see lib/payments/payment-service.ts) — distinct from the
// legacy `paymentStatus` field above, which only the manual "Confirm
// Payment" admin action moves.
const BOOKING_FEE_STATUS_COLORS: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  unpaid: "bg-[color:var(--warning)]/10 text-[color:var(--warning)] border-[color:var(--warning)]/20",
  processing: "bg-sky-50 text-sky-700 border-sky-200",
  failed: "bg-[color:var(--danger)]/10 text-[color:var(--danger)] border-[color:var(--danger)]/20",
  refunded: "bg-slate-100 text-slate-600 border-slate-200",
  partially_refunded: "bg-slate-100 text-slate-600 border-slate-200",
};

const FARE_STATUS_COLORS: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cash_collected: "bg-emerald-50 text-emerald-700 border-emerald-200",
  unpaid: "bg-[color:var(--warning)]/10 text-[color:var(--warning)] border-[color:var(--warning)]/20",
  cash_selected: "bg-amber-50 text-amber-700 border-amber-200",
  processing: "bg-sky-50 text-sky-700 border-sky-200",
  partially_paid: "bg-amber-50 text-amber-700 border-amber-200",
  failed: "bg-[color:var(--danger)]/10 text-[color:var(--danger)] border-[color:var(--danger)]/20",
  refunded: "bg-slate-100 text-slate-600 border-slate-200",
};

function statusLabel(status: string): string {
  return status.split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

function MoneyStatusBadge({ status, colors }: { status: string; colors: Record<string, string> }) {
  const cls = colors[status] ?? "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold border ${cls}`}>
      {statusLabel(status)}
    </span>
  );
}

function formatShortDate(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDate(date);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts[0] === "—") return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

function StatTile({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-black ${accent ? "text-accent-600" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

// ================= MAIN ADMIN PAGE =================
export default function AdminPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f4f8fd]" />}>
      <AdminPageContent />
    </Suspense>
  );
}

function AdminPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<"super_admin" | "admin" | "university_admin" | "viewer" | "ambassador" | "customer" | "unknown">("unknown");
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [activeTab, setActiveTab] = useState<TabName>("overview");
  const [search, setSearch] = useState("");
  const [universities, setUniversities] = useState<ActiveUniversity[]>([]);
  const [universityFilter, setUniversityFilter] = useState("all");
  const [journeyFilter, setJourneyFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [travelDateFilter, setTravelDateFilter] = useState("");
  const [bookingPage, setBookingPage] = useState(1);
  const [selectedBooking, setSelectedBooking] = useState<EnrichedBooking | null>(null);
  const [bookingHistory, setBookingHistory] = useState<BookingAuditEntry[]>([]);
  const [bookingHistoryLoading, setBookingHistoryLoading] = useState(false);
  const [reschedulingBooking, setReschedulingBooking] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [fareCashUpdating, setFareCashUpdating] = useState<string | null>(null);
  const [sendingReceipt, setSendingReceipt] = useState<string | null>(null);
  const [pendingBookingDelete, setPendingBookingDelete] = useState<EnrichedBooking | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentSort, setStudentSort] = useState<"bookings" | "spend" | "recent" | "name">("bookings");
  const [studentPage, setStudentPage] = useState(1);
  const [selectedStudentKey, setSelectedStudentKey] = useState<string | null>(null);

  const defaultSettings = useMemo(
    () => ({
      ticketFee: "5000",
      bookingFee: "2000",
      maxSeats: "15",
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
  const [ambassadors, setAmbassadors] = useState<Array<Record<string, unknown>>>([]);
  const [referrals, setReferrals] = useState<Array<Record<string, unknown>>>([]);
  const [ambassadorMessage, setAmbassadorMessage] = useState("");
  const [createdAmbassadorCredentials, setCreatedAmbassadorCredentials] = useState<CreatedAmbassadorCredentials | null>(null);
  const [referralFilters, setReferralFilters] = useState({ ambassador: "all", route: "all", status: "all", date: "" });
  const [togglingAmbassador, setTogglingAmbassador] = useState<string | null>(null);
  const [updatingCommission, setUpdatingCommission] = useState<string | null>(null);
  const [expandedAmbassadorId, setExpandedAmbassadorId] = useState<string | null>(null);
  const [deletingReferral, setDeletingReferral] = useState<string | null>(null);

  const isViewer = userRole === "viewer";
  const isUniversityAdmin = userRole === "university_admin";
  const isScopedOrReadOnlyAdmin = isViewer || isUniversityAdmin;
  const visibleTabs = useMemo(
    () => (isScopedOrReadOnlyAdmin ? TABS.filter((tab) => isViewerAllowedTab(tab.key)) : TABS),
    [isScopedOrReadOnlyAdmin]
  );
  // proxy.ts already fully gates /admin server-side before this page ever
  // renders (canAccessAdminRoute, using the same authoritative
  // resolveAdminRole() the API routes use) and redirects here with
  // ?accessDenied=1 for anyone it actually blocks. This client-side
  // `!loading && !hasAdminAccess` fallback was a redundant re-check of the
  // same thing using a separately-fetched, less reliable role value — a
  // real super_admin hit a transient/incorrect resolution here and got a
  // false "Access denied" banner despite the server already having let
  // them through. Trusting only the server-verified query param removes
  // the false-positive without weakening anything proxy.ts already
  // enforces.
  const accessDenied = searchParams.get("accessDenied") === "1";
  const effectiveActiveTab = isScopedOrReadOnlyAdmin && !isViewerAllowedTab(activeTab) ? "overview" : activeTab;

  const loadReferralsData = useCallback(async () => {
    try {
      const [ambassadorsRes, referralsRes] = await Promise.all([
        authFetch("/api/ambassadors", { method: "GET" }),
        authFetch("/api/referrals", { method: "GET" }),
      ]);

      if (ambassadorsRes.status === 401 || referralsRes.status === 401) {
        console.warn("Skipping admin data load because the session is not yet authorized.");
        return;
      }

      let ambassadorsData: { ambassadors?: Record<string, unknown>[] } | null = null;
      if (ambassadorsRes.ok) {
        ambassadorsData = await ambassadorsRes.json();
        setAmbassadors(Array.isArray(ambassadorsData?.ambassadors) ? ambassadorsData.ambassadors : []);
      }

      if (referralsRes.ok) {
        const referralsData = await referralsRes.json();
        const rows = Array.isArray(referralsData?.referrals) ? referralsData.referrals : [];
        setReferrals(rows);

        try {
          console.log("admin: loaded ambassadors count", Array.isArray(ambassadorsData?.ambassadors) ? ambassadorsData.ambassadors.length : 0);
        } catch {}
        try {
          console.log("admin: loaded referrals count", rows.length);
        } catch {}
      }
    } catch (error) {
      console.error("Failed to load referral data", error);
    }
  }, []);

  const refreshBookings = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}`, { method: "GET", cache: "no-store" });
      if (res.status === 401) {
        console.warn("Skipping bookings refresh because the session is not yet authorized.");
        return;
      }
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
        paymentStatus: b.paymentStatus,
      }));
      setBookings([...enriched]);
    } catch (error) {
      console.error("Failed to refresh bookings:", error);
    }
  }, []);


  const loadSettings = useCallback(async () => {
    try {
      const res = await authFetch("/api/settings", { method: "GET" });
      if (res.status === 401) {
        console.warn("Skipping settings load because the session is not yet authorized.");
        return;
      }
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
      let session = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { data } = await supabase.auth.getSession();
        session = data.session;
        if (session) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      if (!session) {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          setLoading(false);
          router.replace("/admin/login");
          return;
        }
      }

      const profileRes = await authFetch("/api/profile", { method: "GET" });
      let resolvedRole = normalizeAdminRole("unknown");
      if (profileRes.ok) {
        const profilePayload = await profileRes.json();
        resolvedRole = normalizeAdminRole(profilePayload?.profile?.role ?? profilePayload?.role);
        setUserRole(resolvedRole);
      } else {
        setUserRole("unknown");
      }

      const isGlobalAdmin = resolvedRole === "super_admin" || resolvedRole === "admin";
      await Promise.all([
        refreshBookings(),
        ...(isGlobalAdmin ? [loadSettings(), loadReferralsData()] : []),
      ]);
      setLoading(false);
    };

    void checkSession();
  }, [router, refreshBookings, loadSettings, loadReferralsData]);

  useEffect(() => {
    // Every university regardless of status — a booking made before a
    // campus was deactivated should still resolve to a readable name here,
    // not disappear from the filter options.
    const init = async () => {
      const data = await fetchAllUniversities();
      setUniversities(data);
    };

    void init();
  }, []);

  useEffect(() => {
    const idleMs = 15 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void supabase.auth.signOut();
        router.push("/admin/login");
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
    const id = setInterval(() => {
      void refreshBookings();
      void loadReferralsData();
    }, 15000);
    return () => clearInterval(id);
  }, [refreshBookings, loadReferralsData]);

  const handleLogout = async () => {
  await supabase.auth.signOut();
  router.push("/admin/login");
};

const universityById = useMemo(() => {
    const map = new Map<string, ActiveUniversity>();
    for (const u of universities) map.set(u.id, u);
    return map;
  }, [universities]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (universityFilter !== "all" && b.universityId !== universityFilter) return false;
      if (effectiveActiveTab === "bookings") {
        if (journeyFilter !== "all" && b.status !== journeyFilter) return false;
        if (travelDateFilter && b.travelDate !== travelDateFilter) return false;
        if (paymentFilter === "booking_fee_paid" && b.bookingFeeStatus !== "paid") return false;
        if (paymentFilter === "booking_fee_pending" && (b.bookingFeeStatus === "paid" || b.bookingFeeStatus === "refunded")) return false;
        if (paymentFilter === "fare_paid" && b.fareStatus !== "paid" && b.fareStatus !== "cash_collected") return false;
        if (paymentFilter === "fare_pending" && (b.fareStatus === "paid" || b.fareStatus === "cash_collected" || b.fareStatus === "refunded")) return false;
      }
      if (!q) return true;
      const fields = [b.name, b.studentId, b.destination, b.tripId, b.bookingId, b.phone].map((f) => String(f ?? "").toLowerCase());
      return fields.some((f) => f.includes(q));
    });
  }, [bookings, effectiveActiveTab, journeyFilter, paymentFilter, search, travelDateFilter, universityFilter]);

  const bookingPageCount = Math.max(1, Math.ceil(filtered.length / BOOKINGS_PAGE_SIZE));
  const safeBookingPage = Math.min(bookingPage, bookingPageCount);
  const paginatedBookings = useMemo(() => {
    const start = (safeBookingPage - 1) * BOOKINGS_PAGE_SIZE;
    return filtered.slice(start, start + BOOKINGS_PAGE_SIZE);
  }, [filtered, safeBookingPage]);

  // Real figures: driven by the per-booking bookingFeeStatus/fareStatus and
  // their actual stored amounts (set by PayChangu webhooks and cash
  // collection — see lib/payments/payment-service.ts), never by the legacy
  // `paymentStatus` field or a settings-derived flat fee. That legacy field
  // is only ever moved by the manual "Confirm Payment" admin action and had
  // silently drifted from what customers actually paid.
  const overviewStats = useMemo(() => {
    const total = bookings.length;
    const completed = bookings.filter((b) => b.status === "Completed" || b.status === "Arrived").length;
    const cancelled = bookings.filter((b) => b.status === "Cancelled").length;
    const activeDispatches = bookings.filter((b) => b.status === "Boarding").length;
    const totalSeats = bookings.reduce((sum, b) => sum + (b.seats || 1), 0);
    const uniqueTrips = new Set(bookings.map((b) => b.tripId).filter(Boolean)).size;
    const uniqueStudents = new Set(bookings.map((b) => b.studentId).filter(Boolean)).size;

    let bookingFeePaid = 0;
    let bookingFeePaidCount = 0;
    let bookingFeePending = 0;
    let bookingFeePendingCount = 0;
    let bookingFeeAttention = 0;
    let bookingFeeAttentionCount = 0;

    let farePaid = 0;
    let farePaidCount = 0;
    let farePending = 0;
    let farePendingCount = 0;
    let fareAttention = 0;
    let fareAttentionCount = 0;

    for (const b of bookings) {
      const feeAmount = typeof b.bookingFeeAmount === "number" && Number.isFinite(b.bookingFeeAmount) ? b.bookingFeeAmount : 0;
      const feeStatus = b.bookingFeeStatus || "unpaid";
      if (feeStatus === "paid") {
        bookingFeePaid += feeAmount;
        bookingFeePaidCount += 1;
      } else if (feeStatus === "unpaid" || feeStatus === "processing") {
        bookingFeePending += feeAmount;
        bookingFeePendingCount += 1;
      } else {
        // failed, refunded, partially_refunded
        bookingFeeAttention += feeAmount;
        bookingFeeAttentionCount += 1;
      }

      // The fare column isn't always populated on older/custom-destination
      // bookings — fall back to the same route-price lookup the booking
      // form itself uses, purely so the amount isn't blank. The *status*
      // bucket below always comes from the real fareStatus field, never guessed.
      const seats = b.seats || 1;
      const fareEach =
        typeof b.fare === "number" && Number.isFinite(b.fare) && b.fare > 0
          ? b.fare
          : resolveRouteFareIfAvailable(b.destination, settings.routes) ?? 0;
      const fareTotal = fareEach * seats;
      const fareStatusValue = b.fareStatus || "unpaid";

      if (fareStatusValue === "paid" || fareStatusValue === "cash_collected") {
        farePaid += fareTotal;
        farePaidCount += 1;
      } else if (
        fareStatusValue === "unpaid" ||
        fareStatusValue === "cash_selected" ||
        fareStatusValue === "processing" ||
        fareStatusValue === "partially_paid"
      ) {
        farePending += fareTotal;
        farePendingCount += 1;
      } else {
        // failed, refunded
        fareAttention += fareTotal;
        fareAttentionCount += 1;
      }
    }

    return {
      total,
      completed,
      cancelled,
      activeDispatches,
      totalSeats,
      uniqueTrips,
      uniqueStudents,
      bookingFeePaid,
      bookingFeePaidCount,
      bookingFeePending,
      bookingFeePendingCount,
      bookingFeeAttention,
      bookingFeeAttentionCount,
      farePaid,
      farePaidCount,
      farePending,
      farePendingCount,
      fareAttention,
      fareAttentionCount,
      totalCollected: bookingFeePaid + farePaid,
      totalOutstanding: bookingFeePending + farePending,
    };
  }, [bookings, settings.routes]);

  const referralOverview = useMemo(() => {
    const ambassadorRows = Array.isArray(ambassadors) ? ambassadors : [];
    const referralRows = Array.isArray(referrals) ? referrals : [];

    const totalAmbassadors = ambassadorRows.length;
    const activeAmbassadors = ambassadorRows.filter((item) => String(item.status || "active").toLowerCase() === "active").length;
    const totalReferralCustomers = referralRows.length;
    const totalReferralRevenue = referralRows.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);
    const totalCommissionGenerated = referralRows.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);
    const pendingCommission = referralRows.filter((row) => String(row.commission_status || row.status || "").toLowerCase() === "pending").reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);
    const paidCommission = referralRows.filter((row) => String(row.commission_status || row.status || "").toLowerCase() === "paid").reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);

    const performance = ambassadorRows.map((ambassador) => {
      const ambassadorId = String(ambassador.id || "");
      const ambassadorReferrals = referralRows.filter((row) => String(row.ambassador_id) === ambassadorId);
      const revenue = ambassadorReferrals.reduce((sum, row) => sum + Number(row.commission_amount || 0), 0);
      const commission = revenue;
      return {
        id: ambassadorId,
        name: String(ambassador.full_name || ambassador.name || "—"),
        referralCode: String(ambassador.referral_code || "—"),
        faculty: String(ambassador.faculty || ambassador.university || "—"),
        status: String(ambassador.status || "active"),
        customers: ambassadorReferrals.length,
        bookings: ambassadorReferrals.length,
        revenue,
        commission,
        rows: ambassadorReferrals,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const facultyBreakdown = performance.reduce<Record<string, { label: string; customers: number }>>((acc, item) => {
      const key = item.faculty || "Unspecified";
      if (!acc[key]) acc[key] = { label: key, customers: 0 };
      acc[key].customers += item.customers;
      return acc;
    }, {});

    return {
      totalAmbassadors,
      activeAmbassadors,
      totalReferralCustomers,
      totalReferralRevenue,
      totalCommissionGenerated,
      pendingCommission,
      paidCommission,
      performance,
      facultyBreakdown: Object.values(facultyBreakdown).sort((a, b) => b.customers - a.customers),
    };
  }, [ambassadors, referrals]);

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
    const acc: Record<string, StudentGroup> = {};

    bookings.forEach((b, index) => {
      const rev = calcBookingRevenue(b, settings.routes);
      const rawStudentId = String(b.studentId ?? "").trim();
      const rawPhone = String(b.phone ?? "").trim();

      // Never merge different people together. A real studentId is the only
      // trustworthy identity key; phone is a decent fallback (still the same
      // real person across bookings); with neither, this booking gets its
      // own group rather than being dumped into a shared "UNKNOWN" bucket
      // with every other student who also has no ID on file. The array
      // index (not Math.random()) keeps this deterministic/pure, as
      // required inside a useMemo.
      let key: string;
      let hasIdentityGap = false;
      if (rawStudentId) {
        key = `sid:${rawStudentId.toLowerCase()}`;
      } else if (rawPhone) {
        key = `phone:${rawPhone}`;
        hasIdentityGap = true;
      } else {
        key = `booking:${b.bookingId ?? `idx-${index}`}`;
        hasIdentityGap = true;
      }

      if (!acc[key]) {
        acc[key] = {
          key,
          studentId: rawStudentId || "—",
          name: b.name || "—",
          phone: b.phone || "—",
          bookings: [],
          totalSeats: 0,
          totalSpent: 0,
          unpaidFeeCount: 0,
          unpaidFareCount: 0,
          firstBookingAt: undefined,
          lastBookingAt: undefined,
          hasIdentityGap,
        };
      }

      const group = acc[key];
      group.bookings.push(b);
      group.totalSeats += b.seats || 1;
      group.totalSpent += rev.total;
      if (b.bookingFeeStatus !== "paid") group.unpaidFeeCount += 1;
      if (b.fareStatus !== "paid" && b.fareStatus !== "cash_collected") group.unpaidFareCount += 1;
      if (!group.name || group.name === "—") group.name = b.name || "—";
      if (!group.phone || group.phone === "—") group.phone = b.phone || "—";

      if (b.createdAt) {
        if (!group.firstBookingAt || b.createdAt < group.firstBookingAt) group.firstBookingAt = b.createdAt;
        if (!group.lastBookingAt || b.createdAt > group.lastBookingAt) group.lastBookingAt = b.createdAt;
      }
    });

    return Object.values(acc);
  }, [bookings, settings.routes]);

  const studentStats = useMemo(() => {
    const totalStudents = studentGroups.length;
    const repeatCustomers = studentGroups.filter((s) => s.bookings.length > 1).length;
    const totalRevenue = studentGroups.reduce((sum, s) => sum + s.totalSpent, 0);
    const totalBookingsCount = studentGroups.reduce((sum, s) => sum + s.bookings.length, 0);
    const avgBookings = totalStudents > 0 ? totalBookingsCount / totalStudents : 0;
    return { totalStudents, repeatCustomers, totalRevenue, avgBookings };
  }, [studentGroups]);

  const filteredStudentGroups = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    const list = q
      ? studentGroups.filter(
          (s) => s.name.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q) || s.phone.toLowerCase().includes(q)
        )
      : studentGroups;

    const sorted = [...list];
    if (studentSort === "spend") sorted.sort((a, b) => b.totalSpent - a.totalSpent);
    else if (studentSort === "recent") sorted.sort((a, b) => (b.lastBookingAt || "").localeCompare(a.lastBookingAt || ""));
    else if (studentSort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => b.bookings.length - a.bookings.length);
    return sorted;
  }, [studentGroups, studentSearch, studentSort]);

  const STUDENTS_PAGE_SIZE = 20;
  const totalStudentPages = Math.max(1, Math.ceil(filteredStudentGroups.length / STUDENTS_PAGE_SIZE));
  const safeStudentPage = Math.min(studentPage, totalStudentPages);
  const pagedStudentGroups = useMemo(() => {
    const start = (safeStudentPage - 1) * STUDENTS_PAGE_SIZE;
    return filteredStudentGroups.slice(start, start + STUDENTS_PAGE_SIZE);
  }, [filteredStudentGroups, safeStudentPage]);

  const selectedStudent = useMemo(
    () => studentGroups.find((s) => s.key === selectedStudentKey) ?? null,
    [studentGroups, selectedStudentKey]
  );

  const updateStatus = async (targetId: string, status: JourneyStatus, byTrip = true) => {
    const cancellationReason = status === "Cancelled"
      ? prompt("Enter the cancellation reason (this will be shared with the customer):")?.trim()
      : undefined;
    if (status === "Cancelled" && (!cancellationReason || cancellationReason.length < 5)) {
      if (cancellationReason !== undefined) alert("Please provide a cancellation reason of at least 5 characters.");
      return;
    }

    try {
      setStatusUpdating(targetId);
      const body: Record<string, unknown> = { status, cancellationReason };

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

  const deleteCancelledBooking = async (booking: EnrichedBooking) => {
    const bookingId = booking.bookingId || "";
    if (!bookingId) return;

    try {
      const res = await authFetch(API_BASE, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const result = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !result.success) {
        alert(result.error || "Unable to delete the cancelled booking.");
        return;
      }

      setPendingBookingDelete(null);
      if (selectedBooking?.bookingId === bookingId) {
        setSelectedBooking(null);
        setBookingHistory([]);
      }
      await refreshBookings();
    } catch (error) {
      console.error("Failed to delete cancelled booking", error);
      alert("Network error deleting the cancelled booking.");
    }
  };

  const downloadPaymentReceipt = async (bookingId: string, paymentType: "booking_fee" | "transport_fare") => {
    try {
      const res = await authFetch(`/api/payments/receipt?bookingId=${encodeURIComponent(bookingId)}&paymentType=${paymentType}`, { method: "GET" });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        alert(result?.error || "Unable to generate receipt");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${bookingId}-${paymentType}.pdf`;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error("Receipt download failed", error);
      alert("Network error generating receipt");
    }
  };

  const rescheduleBooking = async (booking: EnrichedBooking, travelDate: string) => {
    const bookingId = booking.bookingId || "";
    if (!bookingId) return false;

    try {
      setReschedulingBooking(bookingId);
      const res = await authFetch(API_BASE, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, travelDate }),
      });
      const result = (await res.json()) as { success?: boolean; booking?: EnrichedBooking; error?: string };
      if (!res.ok || result.success !== true) {
        alert(result.error || "Unable to reschedule booking");
        return false;
      }

      setSelectedBooking(null);
      await refreshBookings();
      return true;
    } catch (error) {
      console.error("Error rescheduling booking", error);
      alert("Network error rescheduling booking");
      return false;
    } finally {
      setReschedulingBooking(null);
    }
  };

  const openBookingDetails = async (booking: EnrichedBooking) => {
    setSelectedBooking(booking);
    setBookingHistory([]);
    if (!booking.bookingId) return;

    setBookingHistoryLoading(true);
    try {
      const res = await authFetch(`${API_BASE}?auditBookingId=${encodeURIComponent(booking.bookingId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const result = (await res.json()) as { success?: boolean; history?: BookingAuditEntry[] };
      if (res.ok && result.success === true && Array.isArray(result.history)) setBookingHistory(result.history);
    } catch (error) {
      console.error("Unable to load booking history", error);
    } finally {
      setBookingHistoryLoading(false);
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

  const createAmbassador = async (payload: AmbassadorCreationPayload) => {
    setAmbassadorMessage("");
    try {
      const res = await authFetch("/api/ambassadors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: payload.fullName,
          phone: payload.phone,
          email: payload.email,
          universityId: payload.universityId,
          university: payload.university,
          faculty: payload.faculty || "",
          program: payload.program || "",
          yearOfStudy: payload.yearOfStudy ? Number(payload.yearOfStudy) : undefined,
          referralCode: payload.referralCode,
          studentId: payload.studentId,
          whatsappNumber: payload.whatsappNumber,
          status: payload.status,
          temporaryPassword: payload.temporaryPassword,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result?.success) {
        throw new Error(result?.error || "Unable to create ambassador");
      }

      const credentials = result.credentials || {};
      setAmbassadorMessage("Ambassador created successfully.");
      setCreatedAmbassadorCredentials({
        fullName: String(credentials.fullName ?? payload.fullName),
        email: String(credentials.email ?? payload.email),
        referralCode: String(credentials.referralCode ?? payload.referralCode ?? ""),
        temporaryPassword: credentials.temporaryPassword ? String(credentials.temporaryPassword) : undefined,
      });
      await loadReferralsData();
    } catch (error) {
      setAmbassadorMessage(error instanceof Error ? error.message : "Unable to create ambassador.");
      setCreatedAmbassadorCredentials(null);
    }
  };

  const toggleAmbassadorStatus = async (ambassadorId: string, nextStatus: string) => {
    setTogglingAmbassador(ambassadorId);
    try {
      const res = await authFetch("/api/ambassadors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ambassadorId, status: nextStatus }),
      });
      const result = await res.json();
      if (!res.ok || !result?.success) {
        throw new Error(result?.error || "Unable to update ambassador status");
      }
      await loadReferralsData();
      setAmbassadorMessage(`Ambassador marked ${nextStatus}.`);
    } catch (error) {
      setAmbassadorMessage(error instanceof Error ? error.message : "Unable to update ambassador status.");
    } finally {
      setTogglingAmbassador(null);
    }
  };

  const updateCommissionStatus = async (referralId: string, commissionStatus: string) => {
    console.log("[updateCommissionStatus] Button clicked:", { referralId, commissionStatus });
    setUpdatingCommission(referralId);
    try {
      console.log("[updateCommissionStatus] Sending API request...");
      const res = await authFetch("/api/commissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralId, commissionStatus }),
      });
      console.log("[updateCommissionStatus] API response status:", res.status);
      const result = await res.json();
      console.log("[updateCommissionStatus] API response body:", result);
      if (!res.ok || !result?.success) {
        throw new Error(result?.error || "Unable to update commission status");
      }
      console.log("[updateCommissionStatus] Update successful, reloading referral data...");
      await loadReferralsData();
      setAmbassadorMessage(`Commission marked ${commissionStatus}.`);
    } catch (error) {
      console.error("[updateCommissionStatus] Error:", error);
      setAmbassadorMessage(error instanceof Error ? error.message : "Unable to update commission status.");
    } finally {
      setUpdatingCommission(null);
    }
  };

  const deleteReferral = async (referralId: string) => {
    if (!confirm("Are you sure you want to delete this referral entry? This action cannot be undone.")) {
      return;
    }
    setDeletingReferral(referralId);
    try {
      console.log("[deleteReferral] Deleting referral:", referralId);
      const res = await authFetch("/api/referrals", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralId }),
      });
      console.log("[deleteReferral] API response status:", res.status);
      const result = await res.json();
      console.log("[deleteReferral] API response body:", result);
      if (!res.ok || !result?.success) {
        throw new Error(result?.error || "Unable to delete referral");
      }
      console.log("[deleteReferral] Delete successful, reloading referral data...");
      await loadReferralsData();
      setAmbassadorMessage("Referral entry deleted successfully.");
    } catch (error) {
      console.error("[deleteReferral] Error:", error);
      setAmbassadorMessage(error instanceof Error ? error.message : "Unable to delete referral.");
    } finally {
      setDeletingReferral(null);
    }
  };

  const isPathActive = (href: string) => pathname === href || (href !== "/admin" && pathname.startsWith(href));
  const currentTabLabel = visibleTabs.find((tab) => tab.key === effectiveActiveTab)?.label || "Dashboard";

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

          <div className="flex lg:hidden gap-1 overflow-x-auto pb-2 flex-wrap">
            {visibleTabs.flatMap((tab) => {
              const items: Array<ReactNode> = [];
              if (tab.key === "whatsapp") {
                items.push(
                  <Link
                    key="applications-mobile"
                    href="/admin/applications"
                    className={`shrink-0 rounded-lg border border-primary-600/30 px-3 py-2 text-xs font-semibold transition ${isPathActive("/admin/applications") ? "bg-primary-600/20 text-primary-950" : "bg-primary-100/80 text-primary-900"}`}
                  >
                    Applications
                  </Link>,
                  <Link
                    key="ambassadors-mobile"
                    href="/admin/ambassadors"
                    className={`shrink-0 rounded-lg border border-primary-600/30 px-3 py-2 text-xs font-semibold transition ${isPathActive("/admin/ambassadors") ? "bg-primary-600/20 text-primary-950" : "bg-primary-100/80 text-primary-900"}`}
                  >
                    Ambassadors
                  </Link>
                );
              }
              items.push(
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                    effectiveActiveTab === tab.key
                      ? "bg-primary-600/10 border border-primary-600/30"
                      : "opacity-70 hover:opacity-100"
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              );
              if (tab.key === "referrals") {
                items.push(
                  <Link key="reports-mobile" href="/admin/reports" className="shrink-0 rounded-lg border border-primary-600/30 bg-primary-100/80 px-3 py-2 text-xs font-semibold text-primary-900">
                    Reports
                  </Link>,
                  <Link key="config-mobile" href="/admin/business-configuration" className="shrink-0 rounded-lg border border-primary-600/30 bg-primary-100/80 px-3 py-2 text-xs font-semibold text-primary-900">
                    Config
                  </Link>,
                  <Link key="rates-mobile" href="/admin/commission-rates" className="shrink-0 rounded-lg border border-primary-600/30 bg-primary-100/80 px-3 py-2 text-xs font-semibold text-primary-900">
                    Rates
                  </Link>,
                  <Link key="communication-mobile" href="/admin/communication" className="shrink-0 rounded-lg border border-primary-600/30 bg-primary-100/80 px-3 py-2 text-xs font-semibold text-primary-900">
                    Communication
                  </Link>,
                  userRole === "super_admin" ? (
                    <Link key="users-mobile" href="/admin/users" className="shrink-0 rounded-lg border border-primary-600/30 bg-primary-100/80 px-3 py-2 text-xs font-semibold text-primary-900">
                      Users
                    </Link>
                  ) : null
                );
              }
              return items;
            })}
          </div>

          <nav className="hidden lg:block space-y-1 text-sm">
            {visibleTabs.flatMap((tab) => {
              const items: Array<ReactNode> = [];
              if (tab.key === "whatsapp") {
                items.push(
                  <Link
                    key="applications-desktop"
                    href="/admin/applications"
                    className={`block rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${isPathActive("/admin/applications") ? "bg-primary-600/10 border border-primary-600/20 font-semibold" : "opacity-70 hover:opacity-100 hover:bg-primary-100"}`}
                  >
                    <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-100/70 text-primary-800">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <path d="M3 10h18" />
                        <path d="M8 2v4" />
                        <path d="M16 2v4" />
                      </svg>
                    </span>
                    Applications
                  </Link>,
                  <Link
                    key="ambassadors-desktop"
                    href="/admin/ambassadors"
                    className={`block rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${isPathActive("/admin/ambassadors") ? "bg-primary-600/10 border border-primary-600/20 font-semibold" : "opacity-70 hover:opacity-100 hover:bg-primary-100"}`}
                  >
                    <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-100/70 text-primary-800">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
                        <circle cx="9.5" cy="7" r="3" />
                        <path d="M17 8v5" />
                        <path d="M14.5 10.5h5" />
                      </svg>
                    </span>
                    Ambassadors
                  </Link>
                );
              }
              items.push(
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition ${
                    effectiveActiveTab === tab.key
                      ? "bg-primary-600/10 border border-primary-600/20 font-semibold"
                      : "opacity-70 hover:opacity-100 hover:bg-primary-100"
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              );
              if (tab.key === "referrals") {
                items.push(
                  <Link key="reports-desktop" href="/admin/reports" className="block rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition opacity-70 hover:opacity-100 hover:bg-primary-100">
                    Reports & Manifests
                  </Link>,
                  <Link key="config-desktop" href="/admin/business-configuration" className="block rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition opacity-70 hover:opacity-100 hover:bg-primary-100">
                    Business Configuration
                  </Link>,
                  <Link key="rates-desktop" href="/admin/commission-rates" className="block rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition opacity-70 hover:opacity-100 hover:bg-primary-100">
                    Commission Rates
                  </Link>,
                  <Link key="communication-desktop" href="/admin/communication" className="block rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition opacity-70 hover:opacity-100 hover:bg-primary-100">
                    Communication Center
                  </Link>,
                  userRole === "super_admin" ? (
                    <Link key="users-desktop" href="/admin/users" className="block rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition opacity-70 hover:opacity-100 hover:bg-primary-100">
                      User Management
                    </Link>
                  ) : null
                );
              }
              return items;
            })}
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
                {visibleTabs.find((t) => t.key === activeTab)?.icon} {currentTabLabel}
              </h2>
              <p className="text-sm text-slate-500 mt-1">{formatDate(new Date())}</p>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative w-full sm:w-64">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">🔎</span>
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setBookingPage(1);
                  }}
                  placeholder="Search bookings..."
                  className="w-full pl-9 pr-3 py-2 border border-[#d7ebff] rounded-xl text-sm bg-[#eef6ff] text-[#101815] placeholder:text-[#64748b] focus:outline-none focus:ring-4 focus:ring-[#0f3f78]/20 focus:border-[#0f3f78]"
                />
                {search && (
                  <button
                    onClick={() => {
                      setSearch("");
                      setBookingPage(1);
                    }}
                    className="absolute inset-y-0 right-2 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
              {(activeTab === "bookings" || activeTab === "trips") && universities.length > 0 && (
                <select
                  value={universityFilter}
                  onChange={(e) => {
                    setUniversityFilter(e.target.value);
                    setBookingPage(1);
                  }}
                  className="rounded-xl border border-[#d7ebff] bg-[#eef6ff] px-3 py-2 text-sm text-[#101815] focus:outline-none focus:ring-4 focus:ring-[#0f3f78]/20 focus:border-[#0f3f78]"
                >
                  <option value="all">All campuses</option>
                  {universities.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              )}
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
                className="lg:hidden bg-danger hover:bg-danger/90 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition shrink-0"
              >
                Logout
              </button>
            </div>
          </div>

          {accessDenied ? (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Access denied. You can only view Overview, Trips, and Bookings.
            </div>
          ) : null}

          {loading ? (
            <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-8">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-accent-600 animate-pulse" />
                <p className="text-slate-600 font-medium">Loading data...</p>
              </div>
            </div>
          ) : (
            <>
              {effectiveActiveTab === "overview" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3 sm:gap-4">
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
                      <p className="text-xs text-slate-500">Completed</p>
                      <h3 className="text-2xl font-extrabold text-emerald-700">{overviewStats.completed}</h3>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-xs text-slate-500">Cancelled</p>
                      <h3 className="text-2xl font-extrabold text-danger">{overviewStats.cancelled}</h3>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-xs text-slate-500">Students</p>
                      <h3 className="text-2xl font-extrabold text-primary-900">{overviewStats.uniqueStudents}</h3>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-xs text-slate-500">Total Seats</p>
                      <h3 className="text-2xl font-extrabold text-primary-900">{overviewStats.totalSeats}</h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-xs font-semibold text-emerald-700">Total Collected</p>
                      <h3 className="text-2xl font-extrabold text-emerald-800">MWK {overviewStats.totalCollected.toLocaleString()}</h3>
                      <p className="mt-1 text-[11px] text-emerald-700/80">Booking fees + fares actually received</p>
                    </div>
                    <div className="rounded-xl border border-warning/20 bg-warning/10 p-4">
                      <p className="text-xs font-semibold text-warning">Total Outstanding</p>
                      <h3 className="text-2xl font-extrabold text-warning">MWK {overviewStats.totalOutstanding.toLocaleString()}</h3>
                      <p className="mt-1 text-[11px] text-warning/80">Booking fees + fares still awaiting payment</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-2 text-sm font-bold text-primary-900">Booking Fees</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-xs text-emerald-700">Paid</p>
                        <h3 className="text-xl font-bold text-emerald-800">{overviewStats.bookingFeePaidCount}</h3>
                        <p className="text-[10px] text-emerald-700/80">MWK {overviewStats.bookingFeePaid.toLocaleString()}</p>
                      </div>
                      <div className="rounded-xl border border-warning/20 bg-warning/10 p-4">
                        <p className="text-xs text-warning">Pending</p>
                        <h3 className="text-xl font-bold text-warning">{overviewStats.bookingFeePendingCount}</h3>
                        <p className="text-[10px] text-warning/80">MWK {overviewStats.bookingFeePending.toLocaleString()}</p>
                      </div>
                      <div className="rounded-xl border border-danger/20 bg-danger/10 p-4">
                        <p className="text-xs text-danger">Needs attention</p>
                        <h3 className="text-xl font-bold text-danger">{overviewStats.bookingFeeAttentionCount}</h3>
                        <p className="text-[10px] text-danger/80">MWK {overviewStats.bookingFeeAttention.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-2 text-sm font-bold text-primary-900">Transport Fares</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-xs text-emerald-700">Paid / Collected</p>
                        <h3 className="text-xl font-bold text-emerald-800">{overviewStats.farePaidCount}</h3>
                        <p className="text-[10px] text-emerald-700/80">MWK {overviewStats.farePaid.toLocaleString()}</p>
                      </div>
                      <div className="rounded-xl border border-warning/20 bg-warning/10 p-4">
                        <p className="text-xs text-warning">Pending</p>
                        <h3 className="text-xl font-bold text-warning">{overviewStats.farePendingCount}</h3>
                        <p className="text-[10px] text-warning/80">MWK {overviewStats.farePending.toLocaleString()}</p>
                      </div>
                      <div className="rounded-xl border border-danger/20 bg-danger/10 p-4">
                        <p className="text-xs text-danger">Needs attention</p>
                        <h3 className="text-xl font-bold text-danger">{overviewStats.fareAttentionCount}</h3>
                        <p className="text-[10px] text-danger/80">MWK {overviewStats.fareAttention.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {effectiveActiveTab === "trips" && (
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
                        const universityId = passengers[0]?.universityId;
                        const campusName = universityId ? universityById.get(universityId)?.name : undefined;
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
                                {campusName && <p className="text-[11px] text-slate-400">🎓 {campusName}</p>}
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
                              {getAllowedJourneyTransitions(status).map((statusValue) => {
                                const label = statusValue === "Cancelled" ? "Cancel" : statusValue;
                                if (isViewer) return null;
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
              {effectiveActiveTab === "bookings" && (
                <div className="bg-[#eef6ff] border border-[#d7ebff] rounded-xl shadow-sm overflow-hidden">
                  <div className="grid gap-3 border-b border-[#d7ebff] bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
                    <select
                      value={journeyFilter}
                      onChange={(event) => {
                        setJourneyFilter(event.target.value);
                        setBookingPage(1);
                      }}
                      className="input-field"
                    >
                      <option value="all">All journey statuses</option>
                      {Object.keys(JOURNEY_STATUS_COLORS).map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                    <select
                      value={paymentFilter}
                      onChange={(event) => {
                        setPaymentFilter(event.target.value);
                        setBookingPage(1);
                      }}
                      className="input-field"
                    >
                      <option value="all">All payment states</option>
                      <option value="booking_fee_paid">Booking fee paid</option>
                      <option value="booking_fee_pending">Booking fee pending</option>
                      <option value="fare_paid">Fare paid / collected</option>
                      <option value="fare_pending">Fare pending</option>
                    </select>
                    <input
                      type="date"
                      value={travelDateFilter}
                      onChange={(event) => {
                        setTravelDateFilter(event.target.value);
                        setBookingPage(1);
                      }}
                      className="input-field"
                      aria-label="Filter by travel date"
                    />
                    <button
                      onClick={() => {
                        setJourneyFilter("all");
                        setPaymentFilter("all");
                        setTravelDateFilter("");
                        setBookingPage(1);
                      }}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Clear booking filters
                    </button>
                  </div>
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
                            <th className="text-left p-3 font-semibold text-slate-600 text-xs hidden lg:table-cell">Campus</th>
                            <th className="text-left p-3 font-semibold text-slate-600 text-xs hidden sm:table-cell">Date</th>
                            <th className="text-center p-3 font-semibold text-slate-600 text-xs">Seats</th>
                            <th className="text-center p-3 font-semibold text-slate-600 text-xs">Journey</th>
                            <th className="text-center p-3 font-semibold text-slate-600 text-xs">Payments</th>
                            <th className="text-right p-3 font-semibold text-slate-600 text-xs">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginatedBookings.map((b, i) => (
                            <tr key={`${b.bookingId || i}`} className="hover:bg-[#f4f8fd] transition">
                              <td className="p-3 font-mono text-xs text-slate-600 break-words-force max-w-25">{b.bookingId || "—"}</td>
                              <td className="p-3 font-medium text-slate-900 break-words-force">{b.name || "—"}</td>
                              <td className="p-3 text-slate-600 hidden md:table-cell break-words-force">{b.studentId || "—"}</td>
                              <td className="p-3 text-slate-600 hidden md:table-cell break-words-force">{b.destination || "—"}</td>
                              <td className="p-3 text-slate-600 hidden lg:table-cell">{b.universityId ? universityById.get(b.universityId)?.name ?? "—" : "—"}</td>
                              <td className="p-3 text-slate-600 hidden sm:table-cell">{b.travelDate || "—"}</td>
                              <td className="p-3 text-center font-semibold">{b.seats || 1}</td>
                              <td className="p-3 text-center">
                                <StatusBadge status={b.status} />
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex min-w-32 flex-col items-start gap-1.5">
                                  <div className="flex items-center gap-1">
                                    <span className="w-16 text-left text-[10px] text-slate-500">Booking fee</span>
                                    <MoneyStatusBadge status={b.bookingFeeStatus || "unpaid"} colors={BOOKING_FEE_STATUS_COLORS} />
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="w-16 text-left text-[10px] text-slate-500">Fare</span>
                                    <MoneyStatusBadge status={b.fareStatus || "unpaid"} colors={FARE_STATUS_COLORS} />
                                  </div>
                                  {b.receiptSent ? (
                                    <span className="text-[10px] text-emerald-700">Receipt sent</span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex flex-wrap gap-1 justify-end">
                                  <button
                                    onClick={() => void openBookingDetails(b)}
                                    className="rounded-lg border border-[#b8dcff] bg-white px-2 py-1 text-[10px] font-semibold text-primary-700 hover:bg-[#eef6ff]"
                                  >
                                    View
                                  </button>
                                  {getAllowedJourneyTransitions(b.status).map((s) => (
                                    !isViewer ? (
                                      <button
                                        key={s}
                                        onClick={() => void updateStatus(b.bookingId || "", s, false)}
                                        disabled={statusUpdating === b.bookingId}
                                        className={`${(JOURNEY_STATUS_COLORS[s] || JOURNEY_STATUS_COLORS.Confirmed).button} text-white text-[10px] px-2 py-1 rounded-lg font-semibold disabled:opacity-50 transition`}
                                      >
                                        {statusUpdating === b.bookingId ? "..." : s === "Cancelled" ? "Cancel" : s}
                                      </button>
                                    ) : null
                                  ))}

                                  {userRole === "super_admin" && b.status === "Cancelled" ? (
                                    <button
                                      type="button"
                                      onClick={() => setPendingBookingDelete(b)}
                                      className="inline-flex size-7 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100"
                                      aria-label={`Permanently delete booking ${b.bookingId || ""}`}
                                      title="Permanently delete cancelled booking"
                                    >
                                      <Trash2 className="size-3.5" aria-hidden="true" />
                                    </button>
                                  ) : null}

                                  {!isViewer && canRecordManualFarePayment(b.bookingFeeStatus, b.fareStatus) ? (
                                    <button
                                      onClick={async () => {
                                        const id = b.bookingId || "";
                                        if (!id) return;
                                        const selectedMethod = prompt("Payment method: cash, bank_transfer, or manual_adjustment", b.fareStatus === "cash_selected" ? "cash" : "bank_transfer")?.trim().toLowerCase();
                                        if (!selectedMethod || !["cash", "bank_transfer", "manual_adjustment"].includes(selectedMethod)) {
                                          if (selectedMethod) alert("Use cash, bank_transfer, or manual_adjustment.");
                                          return;
                                        }
                                        const reference = selectedMethod === "bank_transfer" ? prompt("Enter the bank transfer reference:")?.trim() || "" : prompt("Optional payment reference:")?.trim() || "";
                                        if (selectedMethod === "bank_transfer" && !reference) {
                                          alert("A bank transfer reference is required.");
                                          return;
                                        }
                                        const notes = prompt("Optional admin notes:")?.trim() || "";
                                        if (!confirm(`Record this fare as paid by ${selectedMethod.replaceAll("_", " ")}?`)) return;
                                        setFareCashUpdating(id);
                                        try {
                                          const res = await authFetch("/api/payments/fare/record-manual", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ bookingId: id, paymentMethod: selectedMethod, reference, notes }),
                                          });
                                          const result = await res.json();
                                          if (!result?.success) {
                                            alert(result?.error || "Failed to record fare payment");
                                          }
                                        } catch (e) {
                                          console.error(e);
                                          alert("Network error recording fare payment");
                                        } finally {
                                          await refreshBookings();
                                          setFareCashUpdating(null);
                                        }
                                      }}
                                      disabled={fareCashUpdating === b.bookingId}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] px-2 py-1 rounded-lg font-semibold disabled:opacity-50 transition"
                                    >
                                      {fareCashUpdating === b.bookingId ? "..." : b.fareStatus === "cash_selected" ? "Confirm Cash Fare" : "Record Fare Payment"}
                                    </button>
                                  ) : null}

                                  {!isViewer && canConfirmCashFare(b.bookingFeeStatus, b.fareStatus) ? (
                                    <button
                                      onClick={async () => {
                                        const id = b.bookingId || "";
                                        if (!id) return;
                                        if (!confirm("Confirm that the cash fare was collected from the customer?")) return;
                                        setFareCashUpdating(id);
                                        try {
                                          const res = await authFetch("/api/payments/fare/confirm-cash", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ bookingId: id }),
                                          });
                                          const result = await res.json();
                                          if (!result?.success) {
                                            alert(result?.error || "Failed to confirm cash fare");
                                          }
                                        } catch (e) {
                                          console.error(e);
                                          alert("Network error confirming cash fare");
                                        } finally {
                                          await refreshBookings();
                                          setFareCashUpdating(null);
                                        }
                                      }}
                                      disabled={fareCashUpdating === b.bookingId}
                                      className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] px-2 py-1 rounded-lg font-semibold disabled:opacity-50 transition"
                                    >
                                      {fareCashUpdating === b.bookingId ? "..." : "Confirm Cash Fare"}
                                    </button>
                                  ) : null}

                                  {!isViewer && (b.bookingFeeStatus === "paid" || b.fareStatus === "paid" || b.fareStatus === "cash_collected") ? (
                                    <>
                                      {b.bookingFeeStatus === "paid" ? (
                                        <button
                                          onClick={() => void downloadPaymentReceipt(b.bookingId || "", "booking_fee")}
                                          className="bg-slate-800 hover:bg-slate-900 text-white text-[10px] px-2 py-1 rounded-lg font-semibold transition"
                                        >
                                          Booking Fee PDF
                                        </button>
                                      ) : null}
                                      {b.fareStatus === "paid" || b.fareStatus === "cash_collected" ? (
                                        <button
                                          onClick={() => void downloadPaymentReceipt(b.bookingId || "", "transport_fare")}
                                          className="bg-slate-800 hover:bg-slate-900 text-white text-[10px] px-2 py-1 rounded-lg font-semibold transition"
                                        >
                                          Fare PDF
                                        </button>
                                      ) : null}
                                      <button
                                        onClick={async () => {
                                          const id = b.bookingId || "";
                                          if (!id) return;
                                          if (!b.email) return;
                                          const hasFareReceipt = b.fareStatus === "paid" || b.fareStatus === "cash_collected";
                                          const paymentType = hasFareReceipt && b.bookingFeeStatus === "paid"
                                            ? (confirm("Send the transport fare receipt? Select Cancel to send the booking fee receipt.") ? "transport_fare" : "booking_fee")
                                            : hasFareReceipt ? "transport_fare" : "booking_fee";
                                          setSendingReceipt(id);
                                          try {
                                            const res = await authFetch("/api/payments/send-receipt", {
                                              method: "POST",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ bookingId: id, paymentType }),
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
                                        disabled={!b.email || sendingReceipt === b.bookingId}
                                        className="rounded-lg bg-primary-600 px-2 py-1 text-[10px] font-semibold text-white transition hover:bg-primary-700 disabled:bg-primary-200 disabled:text-slate-500"
                                      >
                                        {sendingReceipt === b.bookingId ? "Sending..." : "Send Receipt"}
                                      </button>
                                      {!b.email ? (
                                        <span className="block text-[10px] text-slate-500 mt-1">No customer email available.</span>
                                      ) : null}
                                    </>
                                  ) : null}

                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="sticky left-0 flex min-w-full items-center justify-between gap-3 border-t border-[#d7ebff] bg-white px-4 py-3">
                        <p className="text-xs text-slate-500">
                          Showing {(safeBookingPage - 1) * BOOKINGS_PAGE_SIZE + 1}–{Math.min(safeBookingPage * BOOKINGS_PAGE_SIZE, filtered.length)} of {filtered.length}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setBookingPage((page) => Math.max(1, page - 1))}
                            disabled={safeBookingPage === 1}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                          >
                            Previous
                          </button>
                          <span className="text-xs font-semibold text-slate-600">Page {safeBookingPage} of {bookingPageCount}</span>
                          <button
                            onClick={() => setBookingPage((page) => Math.min(bookingPageCount, page + 1))}
                            disabled={safeBookingPage === bookingPageCount}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ================= STUDENTS CRM TAB ================= */}
              {!isViewer && effectiveActiveTab === "students" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatTile label="Total Students" value={studentStats.totalStudents} />
                    <StatTile label="Repeat Customers" value={studentStats.repeatCustomers} />
                    <StatTile label="Total Revenue" value={`MWK ${studentStats.totalRevenue.toLocaleString()}`} accent />
                    <StatTile label="Avg Bookings / Student" value={studentStats.avgBookings.toFixed(1)} />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative w-full sm:w-72">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">🔎</span>
                      <input
                        value={studentSearch}
                        onChange={(e) => {
                          setStudentSearch(e.target.value);
                          setStudentPage(1);
                        }}
                        placeholder="Search by name, student ID, or phone..."
                        className="w-full pl-9 pr-8 py-2 border border-[#d7ebff] rounded-xl text-sm bg-[#eef6ff] text-[#101815] placeholder:text-[#64748b] focus:outline-none focus:ring-4 focus:ring-[#0f3f78]/20 focus:border-[#0f3f78]"
                      />
                      {studentSearch && (
                        <button
                          onClick={() => {
                            setStudentSearch("");
                            setStudentPage(1);
                          }}
                          className="absolute inset-y-0 right-2 flex items-center text-slate-400 hover:text-slate-600"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <select
                      value={studentSort}
                      onChange={(e) => setStudentSort(e.target.value as typeof studentSort)}
                      className="rounded-xl border border-[#d7ebff] bg-[#eef6ff] px-3 py-2 text-sm text-[#101815] focus:outline-none focus:ring-4 focus:ring-[#0f3f78]/20 focus:border-[#0f3f78]"
                    >
                      <option value="bookings">Sort: Most bookings</option>
                      <option value="spend">Sort: Highest spend</option>
                      <option value="recent">Sort: Most recent</option>
                      <option value="name">Sort: Name A–Z</option>
                    </select>
                  </div>

                  {filteredStudentGroups.length === 0 ? (
                    <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-8 text-center">
                      <p className="text-slate-700 font-semibold text-lg">
                        {studentSearch ? "No students match your search" : "No students found"}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {pagedStudentGroups.map((student) => (
                          <button
                            key={student.key}
                            type="button"
                            onClick={() => setSelectedStudentKey(student.key)}
                            className="w-full text-left bg-white rounded-xl shadow-sm border border-[#d7ebff] p-4 sm:p-5 hover:shadow-md hover:border-[#0f3f78]/40 transition"
                          >
                            <div className="flex items-center gap-4">
                              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0f3f78] text-sm font-black text-white">
                                {getInitials(student.name)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="font-bold text-primary-900 break-words-force">{student.name}</h3>
                                  {student.bookings.length > 1 ? (
                                    <span className="inline-flex rounded-full border border-primary-200 bg-primary-100 px-2 py-0.5 text-[10px] font-semibold text-primary-700">
                                      Repeat
                                    </span>
                                  ) : (
                                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                      First-time
                                    </span>
                                  )}
                                  {student.unpaidFeeCount > 0 && (
                                    <span className="inline-flex rounded-full border border-[color:var(--warning)]/20 bg-[color:var(--warning)]/10 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--warning)]">
                                      {student.unpaidFeeCount} unpaid fee{student.unpaidFeeCount === 1 ? "" : "s"}
                                    </span>
                                  )}
                                  {student.hasIdentityGap && (
                                    <span
                                      title="No Student ID on file — grouped by phone number or a single booking"
                                      className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500"
                                    >
                                      No ID on file
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-xs text-slate-500">ID: {student.studentId}</p>
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
                          </button>
                        ))}
                      </div>

                      {totalStudentPages > 1 && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs text-slate-500">
                            Page {safeStudentPage} of {totalStudentPages} • {filteredStudentGroups.length} student{filteredStudentGroups.length === 1 ? "" : "s"}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setStudentPage((p) => Math.max(1, p - 1))}
                              disabled={safeStudentPage === 1}
                              className="rounded-xl border border-[#d7ebff] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                            >
                              Previous
                            </button>
                            <button
                              type="button"
                              onClick={() => setStudentPage((p) => Math.min(totalStudentPages, p + 1))}
                              disabled={safeStudentPage === totalStudentPages}
                              className="rounded-xl border border-[#d7ebff] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {selectedStudent && (
                    <div
                      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
                      onClick={() => setSelectedStudentKey(null)}
                    >
                      <div
                        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#d7ebff] bg-white p-5">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#0f3f78] text-base font-black text-white">
                              {getInitials(selectedStudent.name)}
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-lg font-bold text-primary-900 break-words-force">{selectedStudent.name}</h3>
                              <p className="text-xs text-slate-500">
                                ID: {selectedStudent.studentId} • 📱 {selectedStudent.phone}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setSelectedStudentKey(null)}
                            aria-label="Close"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="space-y-5 p-5">
                          {selectedStudent.hasIdentityGap && (
                            <div className="rounded-xl border border-[color:var(--warning)]/20 bg-[color:var(--warning)]/10 p-3 text-xs text-[color:var(--warning)]">
                              No Student ID is on file for this group — matched by{" "}
                              {selectedStudent.phone !== "—" ? "phone number" : "a single booking"} instead. The same student may
                              appear as more than one card if their contact details vary across bookings.
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <StatTile label="Bookings" value={selectedStudent.bookings.length} />
                            <StatTile label="Total Seats" value={selectedStudent.totalSeats} />
                            <StatTile label="Total Spent" value={`MWK ${selectedStudent.totalSpent.toLocaleString()}`} accent />
                            <StatTile label="Last Booked" value={formatShortDate(selectedStudent.lastBookingAt)} />
                          </div>

                          {selectedStudent.phone !== "—" && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard.writeText(selectedStudent.phone);
                                }}
                                className="rounded-xl border border-[#d7ebff] bg-[#eef6ff] px-3 py-2 text-xs font-semibold text-[#0f3f78] hover:bg-[#dbeafe]"
                              >
                                📋 Copy Phone
                              </button>
                              {normalizeMalawiPhone(selectedStudent.phone) && (
                                <a
                                  href={`https://wa.me/${normalizeMalawiPhone(selectedStudent.phone)!.replace("+", "")}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-xl bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
                                >
                                  💬 Chat on WhatsApp
                                </a>
                              )}
                            </div>
                          )}

                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                              Full Booking History ({selectedStudent.bookings.length})
                            </p>
                            <div className="max-h-96 space-y-0 overflow-y-auto rounded-xl border border-[#d7ebff]">
                              {selectedStudent.bookings
                                .slice()
                                .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
                                .map((b, i) => (
                                  <div
                                    key={b.bookingId || i}
                                    className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d7ebff] p-3 text-xs last:border-0"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-medium text-slate-700 break-words-force">{b.destination || "—"}</p>
                                      <p className="text-slate-400">
                                        {b.travelDate || "—"} • {b.seats || 1} seat{b.seats !== 1 ? "s" : ""} • {b.bookingId || "—"}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <StatusBadge status={b.status} />
                                      <MoneyStatusBadge status={b.bookingFeeStatus || "unpaid"} colors={BOOKING_FEE_STATUS_COLORS} />
                                      <MoneyStatusBadge status={b.fareStatus || "unpaid"} colors={FARE_STATUS_COLORS} />
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ================= WHATSAPP BROADCAST TAB ================= */}
              {!isViewer && effectiveActiveTab === "whatsapp" && (
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

              {/* ================= REFERRALS TAB ================= */}
              {!isViewer && effectiveActiveTab === "referrals" && (
                <div className="space-y-6">
                  <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-6">
                    <h3 className="mb-2 font-bold text-primary-900">🎯 Referral Management</h3>
                    <p className="text-sm text-slate-500 mb-4">Create ambassadors, manage their status, and track referral performance from one place.</p>
                    {ambassadorMessage && <div className="mb-4 rounded-lg border border-primary-200 bg-primary-100 p-3 text-sm text-primary-700">{ambassadorMessage}</div>}
                    <div>
                      {createdAmbassadorCredentials ? (
                        <AmbassadorCreationSuccess
                          ambassadorName={createdAmbassadorCredentials.fullName}
                          email={createdAmbassadorCredentials.email}
                          temporaryPassword={createdAmbassadorCredentials.temporaryPassword}
                          referralCode={createdAmbassadorCredentials.referralCode}
                          referralLink={`${typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL ?? "https://travelwithhawkins.com"}/book?ref=${encodeURIComponent(createdAmbassadorCredentials.referralCode)}`}
                          loginUrl={typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL ?? "https://travelwithhawkins.com"}
                          onClose={() => setCreatedAmbassadorCredentials(null)}
                          onResendEmail={async () => {
                            if (!createdAmbassadorCredentials) return;
                            const res = await authFetch("/api/ambassadors/resend", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ email: createdAmbassadorCredentials.email }),
                            });
                            const result = await res.json();
                            if (!res.ok || !result?.success) {
                              throw new Error(result?.error || "Unable to resend welcome email");
                            }
                          }}
                          onGenerateNewPassword={async () => {
                            if (!createdAmbassadorCredentials) throw new Error("Missing ambassador email");
                            const res = await authFetch("/api/ambassadors/password", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ email: createdAmbassadorCredentials.email, mode: "temporary-password" }),
                            });
                            const result = await res.json();
                            if (!res.ok || !result?.success) {
                              throw new Error(result?.error || "Unable to generate temporary password");
                            }
                            return String(result.temporaryPassword);
                          }}
                        />
                      ) : (
                        <AmbassadorCreationWizard onSubmit={createAmbassador} />
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Total ambassadors</p>
                      <p className="mt-2 text-2xl font-black text-slate-900">{referralOverview.totalAmbassadors}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Active ambassadors</p>
                      <p className="mt-2 text-2xl font-black text-slate-900">{referralOverview.activeAmbassadors}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Referral customers</p>
                      <p className="mt-2 text-2xl font-black text-slate-900">{referralOverview.totalReferralCustomers}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Pending commission</p>
                      <p className="mt-2 text-2xl font-black text-slate-900">MWK {referralOverview.pendingCommission.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-primary-900">Referral Overview</h4>
                        <span className="text-xs text-slate-500">Partner performance</span>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Referral revenue</p>
                          <p className="mt-1 text-xl font-black text-slate-900">MWK {referralOverview.totalReferralRevenue.toLocaleString()}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Commission generated</p>
                          <p className="mt-1 text-xl font-black text-slate-900">MWK {referralOverview.totalCommissionGenerated.toLocaleString()}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Paid commission</p>
                          <p className="mt-1 text-xl font-black text-slate-900">MWK {referralOverview.paidCommission.toLocaleString()}</p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">Booked referrals</p>
                          <p className="mt-1 text-xl font-black text-slate-900">{referralOverview.totalReferralCustomers}</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h4 className="font-bold text-primary-900">Top ambassadors</h4>
                      <div className="mt-4 space-y-2">
                        {referralOverview.performance.slice(0, 5).map((item) => (
                          <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                              <p className="text-xs text-slate-500">{item.referralCode}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-primary-900">{item.bookings} bookings</p>
                              <p className="text-xs text-slate-500">MWK {item.revenue.toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-6">
                      <h4 className="font-bold text-primary-900">Ambassadors</h4>
                      <div className="mt-4 space-y-3">
                        {ambassadors.length === 0 ? (
                          <p className="text-sm text-slate-500">No ambassadors yet.</p>
                        ) : ambassadors.map((ambassador) => {
                          const ambassadorId = String(ambassador.id || "");
                          const performanceItem = referralOverview.performance.find((item) => item.id === ambassadorId);
                          const isExpanded = expandedAmbassadorId === ambassadorId;
                          return (
                            <div key={ambassadorId} className="rounded-lg border border-slate-200 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-semibold text-slate-900">{String(ambassador.full_name || ambassador.name || "—")}</p>
                                  <p className="text-xs text-slate-500">Code: {String(ambassador.referral_code || "—")}</p>
                                  <p className="mt-1 text-xs text-slate-500">{String(ambassador.email || "—")}</p>
                                </div>
                                <div className="text-right">
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${String(ambassador.status || "active").toLowerCase() === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{String(ambassador.status || "active")}</span>
                                  <div className="mt-2 flex gap-2">
                                    <button onClick={() => setExpandedAmbassadorId(isExpanded ? null : ambassadorId)} className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                      {isExpanded ? "Hide details" : "View details"}
                                    </button>
                                    <button onClick={() => void toggleAmbassadorStatus(ambassadorId, String(ambassador.status || "active").toLowerCase() === "active" ? "inactive" : "active")} disabled={togglingAmbassador === ambassadorId} className="rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 disabled:opacity-50">
                                      {togglingAmbassador === ambassadorId ? "Updating..." : String(ambassador.status || "active").toLowerCase() === "active" ? "Deactivate" : "Activate"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                              {isExpanded && performanceItem && (
                                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Ambassador profile</p>
                                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">{String(ambassador.full_name || ambassador.name || "—")}</p>
                                      <p className="text-xs text-slate-500">Phone: {String(ambassador.phone || "—")}</p>
                                      <p className="text-xs text-slate-500">Faculty: {String(ambassador.faculty || "—")}</p>
                                      <p className="text-xs text-slate-500">University: {String(ambassador.university || "—")}</p>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                                      <p className="text-xs text-slate-500">Students referred</p>
                                      <p className="text-lg font-black text-slate-900">{performanceItem.customers}</p>
                                      <p className="mt-1 text-xs text-slate-500">Bookings: {performanceItem.bookings}</p>
                                      <p className="text-xs text-slate-500">Revenue: MWK {performanceItem.revenue.toLocaleString()}</p>
                                      <p className="text-xs text-slate-500">Commission: MWK {performanceItem.commission.toLocaleString()}</p>
                                    </div>
                                  </div>
                                  <div className="mt-3">
                                    <p className="text-sm font-semibold text-slate-900">These are the students brought by this ambassador.</p>
                                    <div className="mt-2 space-y-2">
                                      {performanceItem.rows.length === 0 ? (
                                        <p className="text-sm text-slate-500">No referral customers yet.</p>
                                      ) : performanceItem.rows.map((row) => (
                                        <div key={String(row.id)} className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-sm">
                                          <div>
                                            <p className="font-semibold text-slate-900">{String(row.customer_name || "—")}</p>
                                            <p className="text-xs text-slate-500">{String(row.route || "—")} • {String(row.travel_date || "—")}</p>
                                          </div>
                                          <div className="text-right">
                                            <p className="font-semibold text-primary-900">MWK {Number(row.commission_amount || 0).toLocaleString()}</p>
                                            <p className="text-xs text-slate-500">{String(row.commission_status || row.status || "pending")}</p>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-6">
                      <h4 className="font-bold text-primary-900">Referral Bookings</h4>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        <select value={referralFilters.ambassador} onChange={(e) => setReferralFilters({ ...referralFilters, ambassador: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                          <option value="all">All ambassadors</option>
                          {ambassadors.map((ambassador) => <option key={String(ambassador.id)} value={String(ambassador.id)}>{String(ambassador.full_name || ambassador.name || "—")}</option>)}
                        </select>
                        <input value={referralFilters.date} onChange={(e) => setReferralFilters({ ...referralFilters, date: e.target.value })} type="date" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
                        <select value={referralFilters.route} onChange={(e) => setReferralFilters({ ...referralFilters, route: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                          <option value="all">All routes</option>
                          {[...new Set(referrals.map((row) => String((row as Record<string, unknown>).route || "")))] .filter(Boolean).map((route) => <option key={route} value={route}>{route}</option>)}
                        </select>
                        <select value={referralFilters.status} onChange={(e) => setReferralFilters({ ...referralFilters, status: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                          <option value="all">All statuses</option>
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="paid">Paid</option>
                        </select>
                      </div>
                      <div className="mt-4 space-y-3">
                        {(() => {
                          const filteredRows = referrals.filter((referral) => {
                            const ambassadorOk = referralFilters.ambassador === "all" || String(referral.ambassador_id) === referralFilters.ambassador;
                            const routeOk = referralFilters.route === "all" || String((referral as Record<string, unknown>).route || "") === referralFilters.route;
                            const statusOk = referralFilters.status === "all" || String(referral.commission_status || referral.status || "").toLowerCase() === referralFilters.status;
                            const dateOk = !referralFilters.date || String(referral.created_at || "").slice(0, 10) === referralFilters.date;
                            return ambassadorOk && routeOk && statusOk && dateOk;
                          });

                          if (filteredRows.length === 0) {
                            return <p className="text-sm text-slate-500">No referral bookings match the selected filters.</p>;
                          }

                          return filteredRows.slice(0, 8).map((referral) => (
                            <div key={String(referral.id)} className="rounded-lg border border-slate-200 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-semibold text-slate-900">{String(referral.customer_name || "—")}</p>
                                  <p className="text-xs text-slate-500">{String((referral as Record<string, unknown>).route || "—")} • {String(referral.created_at || "—")}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-primary-900">MWK {Number(referral.commission_amount || 0).toLocaleString()}</p>
                                  <p className="text-xs text-slate-500">{String(referral.commission_status || referral.status || "pending")}</p>
                                </div>
                              </div>
                              {!isViewer ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button onClick={() => void updateCommissionStatus(String(referral.id), "approved")} disabled={updatingCommission === String(referral.id)} className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 disabled:opacity-50">
                                    {updatingCommission === String(referral.id) ? "Updating..." : "Approve"}
                                  </button>
                                  <button onClick={() => void updateCommissionStatus(String(referral.id), "paid")} disabled={updatingCommission === String(referral.id)} className="rounded border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-700 disabled:opacity-50">
                                    {updatingCommission === String(referral.id) ? "Updating..." : "Mark Paid"}
                                  </button>
                                  <button onClick={() => void deleteReferral(String(referral.id))} disabled={deletingReferral === String(referral.id)} className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 disabled:opacity-50">
                                    {deletingReferral === String(referral.id) ? "Deleting..." : "Delete"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ================= SETTINGS TAB ================= */}
              {!isViewer && effectiveActiveTab === "settings" && (
                <div className="max-w-2xl space-y-6">
                  <div className="bg-white border border-[#d7ebff] rounded-xl shadow-sm p-6">
                    <h3 className="mb-2 font-bold text-primary-900">⚙️ System Configuration</h3>
                    <p className="text-sm text-slate-500 mb-4">Adjust ticket parameters, routes, and vehicle settings for the current dashboard session.</p>

                    {settingsMsg && (
                      <div className={`mb-4 rounded-lg border p-3 text-sm ${settingsStatus === "success" ? "border-primary-200 bg-primary-100 text-primary-700" : settingsStatus === "error" ? "border-danger/20 bg-danger/10 text-danger" : "border-warning/20 bg-warning/10 text-warning"}`}>
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


                      {!isViewer ? (
                        <button
                          onClick={saveSettings}
                          className="rounded-lg bg-primary-900 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-primary-800"
                        >
                           Save Settings
                        </button>
                      ) : null}
                    </div>
                  </div>

                </div>
              )}
            </>
          )}
        </main>
        {selectedBooking ? (
          <BookingDetailsPanel
            key={selectedBooking.bookingId}
            booking={selectedBooking}
            universityName={selectedBooking.universityId ? universityById.get(selectedBooking.universityId)?.name : undefined}
            isViewer={isViewer}
            rescheduling={reschedulingBooking === selectedBooking.bookingId}
            history={bookingHistory}
            historyLoading={bookingHistoryLoading}
            onClose={() => {
              setSelectedBooking(null);
              setBookingHistory([]);
            }}
            onReschedule={(travelDate) => rescheduleBooking(selectedBooking, travelDate)}
          />
        ) : null}
        <ConfirmDialog
          open={pendingBookingDelete !== null}
          title="Permanently delete booking?"
          description={`Booking ${pendingBookingDelete?.bookingId || ""} will be removed permanently. Payment, referral, and audit records will be retained. This action cannot be undone.`}
          confirmLabel="Delete booking"
          danger
          onCancel={() => setPendingBookingDelete(null)}
          onConfirm={() => pendingBookingDelete ? deleteCancelledBooking(pendingBookingDelete) : undefined}
        />
      </div>
    </div>
  );
}
