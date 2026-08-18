"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { authFetch } from "@/lib/auth";
import type { BookingRecord } from "@/lib/bookingTypes";
import type { JourneyStatus } from "@/lib/bookingUtils";
import { getAllowedJourneyTransitions } from "@/lib/bookingLifecycle";
import { canConfirmCashFare, canRecordManualFarePayment } from "@/lib/adminBookingFareActions";
import { fetchAllUniversities, type ActiveUniversity } from "@/lib/universitiesClient";
import BookingDetailsPanel, { type BookingAuditEntry } from "@/app/admin/components/BookingDetailsPanel";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";
import { LoadingState } from "@/app/components/ui/Spinner";
import JourneyStatusBadge, { JOURNEY_STATUS_COLORS } from "@/app/components/ui/JourneyStatusBadge";
import MoneyStatusBadge, { BOOKING_FEE_STATUS_COLORS, FARE_STATUS_COLORS } from "@/app/components/ui/MoneyStatusBadge";

const API_BASE = "/api/admin/bookings";
const BOOKINGS_PAGE_SIZE = 25;

type EnrichedBooking = BookingRecord & { status: JourneyStatus };

export default function AdminBookingsPage() {
  const [loading, setLoading] = useState(true);
  const [isViewer, setIsViewer] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [bookings, setBookings] = useState<EnrichedBooking[]>([]);
  const [universities, setUniversities] = useState<ActiveUniversity[]>([]);

  const [search, setSearch] = useState("");
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
        const [profileRes, universitiesData] = await Promise.all([authFetch("/api/profile"), fetchAllUniversities()]);
        if (profileRes.ok) {
          const data: unknown = await profileRes.json();
          const role = (data as { profile?: { role?: string } } | null | undefined)?.profile?.role;
          setIsViewer(role === "viewer");
          setIsSuperAdmin(role === "super_admin");
        }
        setUniversities(universitiesData);
        await refreshBookings();
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  // Live operational view, same 15s refresh cadence as Trips.
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
      if (journeyFilter !== "all" && b.status !== journeyFilter) return false;
      if (travelDateFilter && b.travelDate !== travelDateFilter) return false;
      if (paymentFilter === "booking_fee_paid" && b.bookingFeeStatus !== "paid") return false;
      if (paymentFilter === "booking_fee_pending" && (b.bookingFeeStatus === "paid" || b.bookingFeeStatus === "refunded")) return false;
      if (paymentFilter === "fare_paid" && b.fareStatus !== "paid" && b.fareStatus !== "cash_collected") return false;
      if (paymentFilter === "fare_pending" && (b.fareStatus === "paid" || b.fareStatus === "cash_collected" || b.fareStatus === "refunded")) return false;
      if (!q) return true;
      const fields = [b.name, b.studentId, b.destination, b.tripId, b.bookingId, b.phone].map((f) => String(f ?? "").toLowerCase());
      return fields.some((f) => f.includes(q));
    });
  }, [bookings, journeyFilter, paymentFilter, search, travelDateFilter, universityFilter]);

  const bookingPageCount = Math.max(1, Math.ceil(filtered.length / BOOKINGS_PAGE_SIZE));
  const safeBookingPage = Math.min(bookingPage, bookingPageCount);
  const paginatedBookings = useMemo(() => {
    const start = (safeBookingPage - 1) * BOOKINGS_PAGE_SIZE;
    return filtered.slice(start, start + BOOKINGS_PAGE_SIZE);
  }, [filtered, safeBookingPage]);

  const updateStatus = async (bookingId: string, status: JourneyStatus) => {
    const cancellationReason =
      status === "Cancelled" ? prompt("Enter the cancellation reason (this will be shared with the customer):")?.trim() : undefined;
    if (status === "Cancelled" && (!cancellationReason || cancellationReason.length < 5)) {
      if (cancellationReason !== undefined) alert("Please provide a cancellation reason of at least 5 characters.");
      return;
    }

    try {
      setStatusUpdating(bookingId);
      const res = await authFetch(API_BASE, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, status, cancellationReason }),
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary-700">Bookings</p>
          <h1 className="mt-1 text-2xl font-black text-gray-800">All Bookings</h1>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
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
          {universities.length > 0 && (
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
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => {
              setLoading(true);
              void refreshBookings().finally(() => setLoading(false));
            }}
            className="bg-[#0f3f78] hover:bg-[#0a2d56] text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition shrink-0"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading bookings…" />
      ) : (
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
                <option key={status} value={status}>
                  {status}
                </option>
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
                      <td className="p-3 text-slate-600 hidden lg:table-cell">{b.universityId ? (universityById.get(b.universityId)?.name ?? "—") : "—"}</td>
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
                          {b.receiptSent ? <span className="text-[10px] text-emerald-700">Receipt sent</span> : null}
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
                          {getAllowedJourneyTransitions(b.status).map((s) =>
                            !isViewer ? (
                              <button
                                key={s}
                                onClick={() => void updateStatus(b.bookingId || "", s)}
                                disabled={statusUpdating === b.bookingId}
                                className={`${(JOURNEY_STATUS_COLORS[s] || JOURNEY_STATUS_COLORS.Confirmed).button} text-white text-[10px] px-2 py-1 rounded-lg font-semibold disabled:opacity-50 transition`}
                              >
                                {statusUpdating === b.bookingId ? "..." : s === "Cancelled" ? "Cancel" : s}
                              </button>
                            ) : null
                          )}

                          {isSuperAdmin && b.status === "Cancelled" ? (
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
                                const selectedMethod = prompt("Payment method: cash, bank_transfer, or manual_adjustment", b.fareStatus === "cash_selected" ? "cash" : "bank_transfer")
                                  ?.trim()
                                  .toLowerCase();
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
                                  const paymentType =
                                    hasFareReceipt && b.bookingFeeStatus === "paid"
                                      ? confirm("Send the transport fare receipt? Select Cancel to send the booking fee receipt.")
                                        ? "transport_fare"
                                        : "booking_fee"
                                      : hasFareReceipt
                                        ? "transport_fare"
                                        : "booking_fee";
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
                              {!b.email ? <span className="block text-[10px] text-slate-500 mt-1">No customer email available.</span> : null}
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
                  <span className="text-xs font-semibold text-slate-600">
                    Page {safeBookingPage} of {bookingPageCount}
                  </span>
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
        onConfirm={() => (pendingBookingDelete ? deleteCancelledBooking(pendingBookingDelete) : undefined)}
      />
    </div>
  );
}
