"use client";

import { Suspense, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import { authFetch, supabase } from "@/lib/auth";
import { isViewerAllowedTab, normalizeAdminRole } from "@/lib/adminAuth";
import type { AppRole } from "@/lib/permissions";
import { type BookingRecord } from "@/lib/bookingTypes";
import { getAllowedJourneyTransitions } from "@/lib/bookingLifecycle";
import { canConfirmCashFare, canRecordManualFarePayment } from "@/lib/adminBookingFareActions";
import { resolveRouteFareIfAvailable } from "@/lib/routePricing";
import { fetchAllUniversities, type ActiveUniversity } from "@/lib/universitiesClient";
import BookingDetailsPanel, { type BookingAuditEntry } from "@/app/admin/components/BookingDetailsPanel";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";
import JourneyStatusBadge, { JOURNEY_STATUS_COLORS } from "@/app/components/ui/JourneyStatusBadge";
import MoneyStatusBadge, { BOOKING_FEE_STATUS_COLORS, FARE_STATUS_COLORS } from "@/app/components/ui/MoneyStatusBadge";

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

type TabName = "overview" | "bookings";

// ================= PRICING HELPERS =================
// Revenue math lives in lib/bookingRevenue.ts (calcBookingRevenue), shared
// with the Reports summary/exports so the two screens can never disagree on
// what "revenue" means.


// ================= CONSTANTS =================
// Admin dashboard is Supabase-only. Legacy Google Apps Script API is removed.
const API_BASE = "/api/admin/bookings";
const BOOKINGS_PAGE_SIZE = 25;

// Helper that attaches the current Supabase session access token as a
// Bearer Authorization header when available. This allows server-side
// auth helpers to accept the token when cookies are not present.
const TABS: { key: TabName; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "" },
  { key: "bookings", label: "Bookings", icon: "" },
];

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
    }, 15000);
    return () => clearInterval(id);
  }, [refreshBookings]);

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
              if (tab.key === "bookings") {
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
              if (tab.key === "bookings") {
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
              if (tab.key === "bookings") {
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
              if (tab.key === "bookings") {
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
              {activeTab === "bookings" && universities.length > 0 && (
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
                                <JourneyStatusBadge status={b.status} />
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
