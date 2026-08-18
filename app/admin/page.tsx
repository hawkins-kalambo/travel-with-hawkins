"use client";

import { Suspense, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { authFetch, supabase } from "@/lib/auth";
import { isViewerAllowedTab, normalizeAdminRole } from "@/lib/adminAuth";
import type { AppRole } from "@/lib/permissions";
import { type BookingRecord } from "@/lib/bookingTypes";
import { resolveRouteFareIfAvailable } from "@/lib/routePricing";

// ================= TYPES =================
type JourneyStatus =
  | "Booked"
  | "Confirmed"
  | "Boarding"
  | "Arrived"
  | "Completed"
  | "Cancelled"
  | string;

type EnrichedBooking = BookingRecord & {
  status: JourneyStatus;
};

type TabName = "overview";

// ================= PRICING HELPERS =================
// Revenue math lives in lib/bookingRevenue.ts (calcBookingRevenue), shared
// with the Reports summary/exports so the two screens can never disagree on
// what "revenue" means.


// ================= CONSTANTS =================
// Admin dashboard is Supabase-only. Legacy Google Apps Script API is removed.
const API_BASE = "/api/admin/bookings";

// Helper that attaches the current Supabase session access token as a
// Bearer Authorization header when available. This allows server-side
// auth helpers to accept the token when cookies are not present.
const TABS: { key: TabName; label: string; icon: string }[] = [{ key: "overview", label: "Overview", icon: "" }];

function formatDate(date: Date): string {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${weekdays[date.getDay()]}, ${months[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")}, ${date.getFullYear()}`;
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
  const [userRole, setUserRole] = useState<AppRole>("unknown");
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [activeTab, setActiveTab] = useState<TabName>("overview");

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

  const isViewer = userRole === "viewer";
  const isUniversityAdmin = userRole === "university_admin";
  const isScopedOrReadOnlyAdmin = isViewer || isUniversityAdmin;
  const visibleTabs = useMemo(
    () => (isScopedOrReadOnlyAdmin ? TABS.filter((tab) => isViewerAllowedTab(tab.key)) : TABS),
    [isScopedOrReadOnlyAdmin]
  );
  const hasAdminAccess = userRole === "super_admin" || userRole === "admin" || isUniversityAdmin || isViewer;
  const accessDenied = searchParams.get("accessDenied") === "1" || (!loading && !hasAdminAccess);
  const effectiveActiveTab = isScopedOrReadOnlyAdmin && !isViewerAllowedTab(activeTab) ? "overview" : activeTab;

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
        ...(isGlobalAdmin ? [loadSettings()] : []),
      ]);
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
    }, 15000);
    return () => clearInterval(id);
  }, [refreshBookings]);

  const handleLogout = async () => {
  await supabase.auth.signOut();
  router.push("/admin/login");
};

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



  const isPathActive = (href: string) => pathname === href || (href !== "/admin" && pathname.startsWith(href));
  const currentTabLabel = visibleTabs.find((tab) => tab.key === effectiveActiveTab)?.label || "Dashboard";

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
              if (tab.key === "overview") {
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
              if (tab.key === "overview") {
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
              if (tab.key === "overview") {
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
              if (tab.key === "overview") {
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
              Access denied. You don&apos;t have permission to view this page.
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
            </>
          )}
        </main>
      </div>
    </div>
  );
}
