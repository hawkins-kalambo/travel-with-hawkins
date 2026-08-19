"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/auth";
import type { BookingRecord } from "@/lib/bookingTypes";
import type { JourneyStatus } from "@/lib/bookingUtils";
import PageHeader from "@/app/components/ui/PageHeader";
import { LoadingState } from "@/app/components/ui/Spinner";

type EnrichedBooking = BookingRecord & { status: JourneyStatus };

export default function AdminOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);

  const refreshBookings = async () => {
    try {
      const res = await authFetch("/api/admin/bookings", { method: "GET", cache: "no-store" });
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
        await refreshBookings();
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  // Live operational view, same 15s refresh cadence as Trips/Bookings.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshBookings();
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, []);

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

      // A free-text/custom-destination booking with no admin-confirmed fare
      // yet contributes 0 here rather than a guessed amount — see
      // app/api/bookings/route.ts for why fare legitimately starts unset.
      const seats = b.seats || 1;
      const fareEach = typeof b.fare === "number" && Number.isFinite(b.fare) && b.fare > 0 ? b.fare : 0;
      const fareTotal = fareEach * seats;
      const fareStatusValue = b.fareStatus || "unpaid";

      if (fareStatusValue === "paid" || fareStatusValue === "cash_collected") {
        farePaid += fareTotal;
        farePaidCount += 1;
      } else if (fareStatusValue === "unpaid" || fareStatusValue === "cash_selected" || fareStatusValue === "processing" || fareStatusValue === "partially_paid") {
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
  }, [bookings]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        actions={
          <button
            onClick={() => {
              setLoading(true);
              void refreshBookings().finally(() => setLoading(false));
            }}
            className="bg-[#0f3f78] hover:bg-[#0a2d56] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition shrink-0"
          >
            Refresh
          </button>
        }
      />

      {loading ? (
        <LoadingState label="Loading dashboard…" />
      ) : (
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
    </div>
  );
}
